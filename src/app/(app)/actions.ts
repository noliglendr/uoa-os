"use server";

// Every change made from the app. Business rules (gates, R1, R3, R4, who may
// verify or approve) are enforced by the database; these actions only pass
// the user's request through and show the database's answer.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/session";
import { PARTY_ROLES, formatDate, formatDateTime, label, parseMoney } from "@/lib/labels";
import { newLink } from "@/lib/documents";
import { computeDeadline, today, type DeadlineRule } from "@/lib/deadlines";
import { generateDraft } from "@/lib/draft-ai";
import {
  CASE_FACT_KINDS, NOTICE_NAMES, cleanLines, draftFacts, draftPrompt, fillFirmBlanks, fillItemList, fillOutlineBlanks, missingBlanks,
  outlineFacts, statementFacts, stepBPrompt, type DraftKind,
} from "@/lib/drafting";

type Client = Awaited<ReturnType<typeof createClient>>;

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function optional(form: FormData, key: string): string | null {
  return text(form, key) || null;
}

function friendly(error: PostgrestError | Error): string {
  const code = "code" in error ? error.code : undefined;
  if (code === "42501" && !/^Only|^Rule/.test(error.message)) {
    return "You don't have permission to do that.";
  }
  if (code === "23505") return "That was already recorded.";
  return error.message;
}

function back(form: FormData): string {
  const path = text(form, "back");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

/** Runs one change, refreshes the page, and shows the database's error if it refused. */
type Result = { error: PostgrestError | null } | void;

async function run(form: FormData, change: (db: Client) => PromiseLike<Result> | Promise<Result>) {
  const path = back(form);
  let message: string | null = null;
  try {
    const db = await createClient();
    const result = await change(db);
    if (result && result.error) message = friendly(result.error);
  } catch (e) {
    message = e instanceof Error ? friendly(e) : "Something went wrong.";
  }
  // Back to the same page and tab; the error (if any) shows in a banner.
  const url = new URL(path, "http://app");
  url.searchParams.delete("error");
  if (message) url.searchParams.set("error", message);
  revalidatePath(url.pathname);
  redirect(url.pathname + url.search);
}

async function loadRule(db: Client, code: string | null): Promise<DeadlineRule | null> {
  if (!code) return null;
  const { data, error } = await db.from("deadline_rules").select("*").eq("code", code).single();
  if (error) throw error;
  return {
    code: data.code,
    label: data.label,
    kind: data.kind,
    days: data.days,
    mailingExtension: data.mailing_extension,
    prepDays: data.prep_days,
    attorneyVerified: data.attorney_verified,
  };
}

async function mailingExtensionDays(db: Client): Promise<number> {
  const { data } = await db.from("settings").select("value").eq("key", "deadline.mailing_extension_days").single();
  return Number(data?.value ?? 3);
}

/** Deadline fields computed by the deadline module from the form. */
async function deadlineFromForm(db: Client, form: FormData, defaultTrigger: string | null = null) {
  const rule = await loadRule(db, optional(form, "rule_code"));
  const triggerDate = optional(form, "trigger_date") ?? defaultTrigger;
  const c = computeDeadline({
    rule,
    triggerDate,
    noticeDate: optional(form, "notice_due_date"),
    mailed: form.get("mailed") === "on",
    mailingExtensionDays: await mailingExtensionDays(db),
  });
  return {
    rule_code: rule?.code ?? null,
    kind: c.kind,
    title: optional(form, "title") ?? rule?.label ?? "Deadline",
    trigger_date: triggerDate,
    raw_due_date: c.rawDueDate,
    due_date: c.dueDate,
    mailing_extension: c.mailingExtension,
    attendee: optional(form, "attendee"),
    prep_date: c.prepDate,
  };
}

// ---------------------------------------------------------------------------
// Matters
// ---------------------------------------------------------------------------

export async function createMatter(form: FormData) {
  const db = await createClient();
  const { data, error } = await db
    .from("matters")
    .insert({
      code: text(form, "code"),
      summary: text(form, "summary"),
      matter_type: text(form, "matter_type"),
      urgent: form.get("urgent") === "on",
      hard_deadline: form.get("hard_deadline") === "on",
      engagement_alert_date: optional(form, "engagement_alert_date"),
    })
    .select("id")
    .single();
  if (error) redirect(`/matters/new?error=${encodeURIComponent(friendly(error))}`);

  const parties = [0, 1, 2]
    .map((i) => ({ label: text(form, `party_label_${i}`), party_role: text(form, `party_role_${i}`) }))
    .filter((p) => p.label);
  if (parties.length > 0) {
    const { error: partyError } = await db.from("parties").insert(parties.map((p) => ({ ...p, matter_id: data.id })));
    if (partyError) redirect(`/matters/${data.id}?error=${encodeURIComponent(friendly(partyError))}`);
  }
  revalidatePath("/");
  redirect(`/matters/${data.id}`);
}

export async function advanceStage(form: FormData) {
  await run(form, (db) => db.rpc("advance_stage", { p_matter: text(form, "matter_id") }));
}

export async function approveGate(form: FormData) {
  await run(form, (db) =>
    db.rpc("approve_gate", {
      p_matter: text(form, "matter_id"),
      p_stage: Number(text(form, "stage")),
      p_cycle: optional(form, "cycle_id"),
      p_note: optional(form, "note"),
    }),
  );
}

export async function declineMatter(form: FormData) {
  await run(form, (db) => db.rpc("decline_matter", { p_matter: text(form, "matter_id"), p_reason: text(form, "reason") }));
}

export async function closeMatter(form: FormData) {
  await run(form, (db) => db.rpc("close_matter", { p_matter: text(form, "matter_id") }));
}

const MATTER_FLAGS = ["joint_consent", "closing_letter_sent", "urgent", "legal_hold"] as const;

export async function setMatterFlag(form: FormData) {
  const flag = text(form, "flag") as (typeof MATTER_FLAGS)[number];
  await run(form, async (db) => {
    if (!MATTER_FLAGS.includes(flag)) throw new Error("Unknown field");
    return db.from("matters").update({ [flag]: text(form, "value") === "true" }).eq("id", text(form, "matter_id"));
  });
}

// ---------------------------------------------------------------------------
// Parties and appearances
// ---------------------------------------------------------------------------

export async function addParty(form: FormData) {
  await run(form, (db) =>
    db.from("parties").insert({
      matter_id: text(form, "matter_id"),
      label: text(form, "label"),
      party_role: text(form, "party_role"),
      is_client: form.get("is_client") === "on",
    }),
  );
}

export async function clearConflict(form: FormData) {
  await run(form, (db) =>
    db
      .from("parties")
      .update({ conflict_cleared: text(form, "value") === "true", conflict_note: optional(form, "note") })
      .eq("id", text(form, "party_id")),
  );
}

export async function addAppearance(form: FormData) {
  await run(form, (db) =>
    db.from("appearances").insert({
      matter_id: text(form, "matter_id"),
      party_id: text(form, "party_id"),
      form: text(form, "form"),
      forum: text(form, "forum"),
      filed_on: optional(form, "filed_on"),
    }),
  );
}

export async function updateAppearance(form: FormData) {
  await run(form, async (db) => {
    const status = text(form, "status");
    let transferredTo: string | null = null;
    if (status === "transferred") {
      const { data, error } = await db.from("matters").select("id").eq("code", text(form, "target_code")).maybeSingle();
      if (error) return { error };
      if (!data) throw new Error("No matter with that code. Open the successor matter first.");
      transferredTo = data.id;
    }
    return db.from("appearances").update({ status, transferred_to: transferredTo }).eq("id", text(form, "appearance_id"));
  });
}

// ---------------------------------------------------------------------------
// Deadlines and notices (R1)
// ---------------------------------------------------------------------------

export async function addDeadline(form: FormData) {
  await run(form, async (db) => {
    const d = await deadlineFromForm(db, form);
    return db.from("deadlines").insert({
      ...d,
      matter_id: text(form, "matter_id"),
      notice_id: optional(form, "notice_id"),
      filing_id: optional(form, "filing_id"),
      cycle_id: optional(form, "cycle_id"),
    });
  });
}

export async function updateDeadline(form: FormData) {
  const field = text(form, "field");
  await run(form, async (db) => {
    const id = text(form, "deadline_id");
    if (field === "verify") return db.from("deadlines").update({ attorney_verified: true }).eq("id", id);
    if (field === "reschedule") return db.from("deadlines").update({ reschedule_requested: true }).eq("id", id);
    if (["met", "missed", "cancelled"].includes(field)) return db.from("deadlines").update({ status: field }).eq("id", id);
    throw new Error("Unknown change");
  });
}

export async function logNotice(form: FormData) {
  await run(form, async (db) => {
    const noDeadline = optional(form, "no_deadline_reason");
    const hasDeadline = !noDeadline && (optional(form, "rule_code") || optional(form, "notice_due_date"));
    const noticeDate = text(form, "notice_date");
    const deadline = hasDeadline ? await deadlineFromForm(db, form, noticeDate) : null;
    return db.rpc("log_notice", {
      p_matter: text(form, "matter_id"),
      p_filing: optional(form, "filing_id"),
      p_type: text(form, "notice_type"),
      p_channel: text(form, "channel"),
      p_notice_date: noticeDate,
      p_received_on: optional(form, "received_on") ?? today(),
      p_note: optional(form, "note"),
      p_deadline: deadline,
      p_no_deadline_reason: noDeadline,
    });
  });
}

export async function recordNoDeadline(form: FormData) {
  await run(form, (db) =>
    db.rpc("record_no_deadline", { p_notice: text(form, "notice_id"), p_reason: text(form, "reason") }),
  );
}

// ---------------------------------------------------------------------------
// Filings and response cycles
// ---------------------------------------------------------------------------

export async function addFiling(form: FormData) {
  await run(form, (db) =>
    db.from("filings").insert({
      matter_id: text(form, "matter_id"),
      form_type: text(form, "form_type"),
      forum: text(form, "forum"),
      ref_no: optional(form, "ref_no"),
    }),
  );
}

export async function updateFiling(form: FormData) {
  const field = text(form, "field");
  await run(form, async (db) => {
    const id = text(form, "filing_id");
    const now = new Date().toISOString();
    switch (field) {
      case "filed":
        return db
          .from("filings")
          .update({
            filed_at: now,
            filing_method: optional(form, "filing_method"),
            fee_cents: optional(form, "fee") ? Math.round(Number(text(form, "fee")) * 100) : null,
            proof_ref: optional(form, "proof_ref"),
          })
          .eq("id", id);
      case "ref_no":
        return db.from("filings").update({ ref_no: optional(form, "ref_no") }).eq("id", id);
      case "decision":
        return db.from("filings").update({ decision: text(form, "decision") }).eq("id", id);
      case "client_informed":
        return db.from("filings").update({ client_informed_at: now }).eq("id", id);
      case "post_decision":
        return db.from("filings").update({ post_decision: text(form, "post_decision") }).eq("id", id);
    }
    throw new Error("Unknown change");
  });
}

export async function openCycle(form: FormData) {
  await run(form, (db) =>
    db.rpc("open_response_cycle", {
      p_filing: text(form, "filing_id"),
      p_kind: text(form, "kind"),
      p_notice: optional(form, "notice_id"),
    }),
  );
}

export async function advanceCycle(form: FormData) {
  await run(form, (db) => db.rpc("advance_cycle", { p_cycle: text(form, "cycle_id") }));
}

// ---------------------------------------------------------------------------
// Checklist and tasks
// ---------------------------------------------------------------------------

export async function addChecklistItem(form: FormData) {
  await run(form, (db) =>
    db.from("checklist_items").insert({
      matter_id: text(form, "matter_id"),
      cycle_id: optional(form, "cycle_id"),
      label: text(form, "label"),
      owner: text(form, "owner"),
      third_party_draft: form.get("third_party_draft") === "on",
    }),
  );
}

export async function setChecklistStatus(form: FormData) {
  await run(form, (db) =>
    db.from("checklist_items").update({ status: text(form, "status") }).eq("id", text(form, "item_id")),
  );
}

// ---------------------------------------------------------------------------
// Fixing mistakes (decision #20): Edit, and "Entered in error" instead of delete
// ---------------------------------------------------------------------------

export type CorrectionState = { ok?: string; error?: string } | null;

/** Edit a row's listed fields (form fields named "f_<column>"; "f_fee" is in dollars). */
export async function editRecord(_prev: CorrectionState, form: FormData): Promise<CorrectionState> {
  const values: Record<string, string | number | null> = {};
  for (const [key, raw] of form.entries()) {
    if (!key.startsWith("f_")) continue;
    const name = key.slice(2);
    const value = String(raw).trim();
    if (name === "fee") {
      const dollars = Number(value);
      if (value && !(Number.isFinite(dollars) && dollars >= 0)) return { error: "Enter the fee as a number, for example 715." };
      values.fee_cents = value ? Math.round(dollars * 100) : null;
    } else {
      values[name] = value || null;
    }
  }
  return correction(form, "Saved. The old value is kept in History.", (db) =>
    db.rpc("edit_record", { p_table: text(form, "table"), p_id: text(form, "id"), p_values: values }),
  );
}

export async function markEnteredInError(_prev: CorrectionState, form: FormData): Promise<CorrectionState> {
  return correction(form, "Marked as entered in error.", (db) =>
    db.rpc("mark_entered_in_error", { p_table: text(form, "table"), p_id: text(form, "id"), p_reason: text(form, "reason") }),
  );
}

async function correction(form: FormData, ok: string, change: (db: Client) => PromiseLike<{ error: PostgrestError | null }>): Promise<CorrectionState> {
  try {
    const { error } = await change(await createClient());
    if (error) return { error: friendly(error) };
  } catch (e) {
    return { error: e instanceof Error ? friendly(e) : "Something went wrong." };
  }
  revalidatePath(new URL(back(form), "http://app").pathname);
  return { ok };
}

export async function completeTask(form: FormData) {
  await run(form, (db) => db.from("tasks").update({ status: "done" }).eq("id", text(form, "task_id")));
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export async function verifyRule(form: FormData) {
  await run(form, (db) =>
    db
      .from("deadline_rules")
      .update({ attorney_verified: text(form, "value") === "true" })
      .eq("code", text(form, "code")),
  );
}

export async function updateRuleNote(form: FormData) {
  await run(form, (db) =>
    db.from("deadline_rules").update({ note: optional(form, "note") }).eq("code", text(form, "code")),
  );
}

export async function updateSetting(form: FormData) {
  await run(form, async (db) => {
    // The settings screen sends plain form fields; "kind" says how to read them.
    let value: unknown;
    const raw = text(form, "value");
    switch (text(form, "kind")) {
      case "bool":
        value = raw === "true";
        break;
      case "number":
        value = Number(raw);
        if (!Number.isFinite(value as number) || raw === "") throw new Error("Enter a number.");
        break;
      case "numbers":
        value = raw.split(/[\s,]+/).filter(Boolean).map(Number);
        if ((value as number[]).some((n) => !Number.isInteger(n) || n < 0)) throw new Error("Enter whole numbers separated by commas.");
        break;
      case "choice":
        value = raw;
        break;
      case "multi":
        value = form.getAll("value").map(String);
        if ((value as string[]).length === 0) throw new Error("Choose at least one.");
        break;
      default:
        try {
          value = JSON.parse(raw);
        } catch {
          throw new Error('The value must be valid JSON (for example 7, true, "off" or [21, 14, 7]).');
        }
    }
    return db.from("settings").update({ value }).eq("key", text(form, "key"));
  });
}

// ---------------------------------------------------------------------------
// Weekly status sweep (redline 9)
// ---------------------------------------------------------------------------

export async function recordSweepCheck(form: FormData) {
  await run(form, (db) =>
    db.rpc("log_event", {
      p_event_type: "sweep.checked",
      p_entity_type: text(form, "entity_type") === "filing" ? "filing" : "matter",
      p_entity_id: text(form, "entity_id"),
      p_matter_id: text(form, "matter_id"),
      p_payload: { result: text(form, "result"), note: optional(form, "note") },
    }),
  );
}

// ---------------------------------------------------------------------------
// AI letter drafts (decisions #22, #23). The attorney approves; nothing is sent.
// ---------------------------------------------------------------------------

export type DraftInput = {
  matterId: string;
  kind: DraftKind;
  filingId: string | null;
  /** Step B: the response (RFE/NOID) the outline is for. */
  cycleId?: string | null;
  /** Step B: what staff typed: the notice's issues, or the statement's facts (one per line). */
  lines?: string;
  /** Step B statements: who speaks (a party, by role label) and why. */
  partyId?: string | null;
  purpose?: string;
};
export type DraftPreview = { text: string; model: string } | { error: string };

function problem(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? friendly(e as Error) : "Something went wrong.";
}

/** Makes the letter for one matter. Saves nothing. */
async function buildDraft(db: Client, input: DraftInput) {
  const { matterId, kind, filingId } = input;
  // Refused requests (role, setting off, template not approved, matter closed) stop here.
  const allowed = await db.rpc("draft_start_check", { p_matter: matterId, p_kind: kind });
  if (allowed.error) throw allowed.error;
  if (CASE_FACT_KINDS.includes(kind)) return buildStepB(db, input);

  const [matter, template, filing, checklist] = await Promise.all([
    db.from("matters").select("*").eq("id", matterId).single(),
    db.from("draft_templates").select("body").eq("kind", kind).single(),
    filingId ? db.from("filings").select("*").eq("id", filingId).single() : Promise.resolve({ data: null, error: null }),
    db.from("checklist_items").select("label, owner, status, voided_at").eq("matter_id", matterId),
  ]);
  const failed = matter.error ?? template.error ?? filing.error ?? checklist.error;
  if (failed) throw failed;
  if (!template.data) throw new Error("The letter template was not found.");

  const body = template.data.body as string;
  const { system, user } = draftPrompt(body, draftFacts(matter.data, filing.data));
  const result = await generateDraft(system, user, body);
  const lost = missingBlanks(body, result.text);
  if (lost.length) throw new Error(`The AI draft lost ${lost.join(", ")}. Try again.`);
  const attorney = matter.data.attorney_id
    ? await db.from("profiles").select("display_name").eq("id", matter.data.attorney_id).maybeSingle()
    : { data: null, error: null };
  if (attorney.error) throw attorney.error;
  const text = fillFirmBlanks(fillItemList(result.text, kind, checklist.data ?? []), {
    today: new Date(),
    attorney: (attorney.data?.display_name as string | undefined) ?? null,
  });
  return { text, model: result.model };
}

/** What staff typed for a Step B draft, as stored with it for the attorney. */
function stepBInputs(input: DraftInput) {
  const lines = cleanLines(input.lines ?? "");
  return input.kind === "response_outline" ? { issues: lines } : { purpose: input.purpose ?? "personal", party_id: input.partyId ?? null, facts: lines };
}

/** Step B (decision #32): an RFE/NOID response outline or a statement draft. */
async function buildStepB(db: Client, input: DraftInput) {
  const kind = input.kind as "response_outline" | "statement_draft";
  const lines = cleanLines(input.lines ?? "");
  if (lines.length === 0) {
    throw new Error(kind === "response_outline" ? "List the issues in the notice, one per line." : "Write the facts, one per line.");
  }
  // The same safety net as the database: no A-numbers, receipt or Social Security numbers to the AI.
  if (/\bA-?\s?\d{8,9}\b|\b[A-Z]{3}\d{10}\b|\b\d{3}-\d{2}-\d{4}\b/.test(lines.join("\n"))) {
    throw new Error("This looks like an A-number, receipt number or Social Security number. Leave client details out: use role words and blanks.");
  }

  const [template, matter] = await Promise.all([
    db.from("draft_templates").select("body").eq("kind", kind).single(),
    db.from("matters").select("attorney_id").eq("id", input.matterId).single(),
  ]);
  if (template.error) throw template.error;
  if (matter.error) throw matter.error;
  const body = template.data.body as string;

  let facts: object;
  let fill = (text: string) => text;
  if (kind === "response_outline") {
    if (!input.cycleId) throw new Error("Choose the RFE or NOID response.");
    const cycle = await db.from("response_cycles").select("*").eq("id", input.cycleId).eq("matter_id", input.matterId).single();
    if (cycle.error) throw new Error("That response is not on this matter.");
    const [filing, evidence, deadline] = await Promise.all([
      db.from("filings").select("form_type, forum").eq("id", cycle.data.filing_id).maybeSingle(),
      db.from("checklist_items").select("label, status, voided_at, cycle_id").eq("matter_id", input.matterId).order("created_at"),
      db.from("deadlines").select("due_date").eq("cycle_id", input.cycleId).eq("status", "open").order("due_date").limit(1).maybeSingle(),
    ]);
    // The response's own checklist first, then the matter's.
    const items = (evidence.data ?? []).filter((i) => !i.voided_at).sort((a, b) => Number(b.cycle_id === input.cycleId) - Number(a.cycle_id === input.cycleId));
    facts = outlineFacts(cycle.data, filing.data, lines, items);
    fill = (text) =>
      fillOutlineBlanks(text, {
        notice: NOTICE_NAMES[cycle.data.kind] ?? "Agency notice",
        formType: filing.data?.form_type ?? null,
        due: deadline.data?.due_date ? formatDate(deadline.data.due_date) : null,
        exhibits: items.filter((i) => i.cycle_id === input.cycleId || i.cycle_id === null).map((i) => i.label),
      });
  } else {
    const party = input.partyId
      ? await db.from("parties").select("party_role").eq("id", input.partyId).eq("matter_id", input.matterId).maybeSingle()
      : { data: null };
    facts = statementFacts(party.data ? label(PARTY_ROLES, party.data.party_role) : null, input.purpose ?? "personal", lines);
  }

  const { system, user } = stepBPrompt(kind, body, facts);
  const result = await generateDraft(system, user, body);
  const lost = missingBlanks(body, result.text);
  if (lost.length) throw new Error(`The AI draft lost ${lost.join(", ")}. Try again.`);
  const attorney = matter.data.attorney_id
    ? await db.from("profiles").select("display_name").eq("id", matter.data.attorney_id).maybeSingle()
    : { data: null };
  const text = fillFirmBlanks(fill(result.text), { today: new Date(), attorney: (attorney.data?.display_name as string | undefined) ?? null });
  return { text, model: result.model };
}

/** "Make draft": shows the letter in a window. Nothing is saved until "Save draft". */
export async function previewDraft(input: DraftInput): Promise<DraftPreview> {
  try {
    return await buildDraft(await createClient(), input);
  } catch (e) {
    return { error: problem(e) };
  }
}

/**
 * "Save draft": the draft is stored and waits for the attorney. Changes typed in
 * the window are saved as an edit, so History and "Show the first text" keep what
 * UOA OS made apart from what a person wrote.
 */
export async function saveNewDraft(input: DraftInput & { text: string; model: string; edited: string }): Promise<{ error?: string }> {
  try {
    const db = await createClient();
    // With no AI key the letter is made again here, so the first text stored is exactly
    // the template. An AI letter can't be made the same twice, so the one shown is kept.
    const draft = process.env.ANTHROPIC_API_KEY ? { text: input.text, model: input.model } : await buildDraft(db, input);
    const stepB = CASE_FACT_KINDS.includes(input.kind);
    const created = await db.rpc("create_draft", {
      p_matter: input.matterId,
      p_kind: input.kind,
      p_filing: input.filingId,
      p_body: draft.text,
      p_model: draft.model,
      p_cycle: stepB ? (input.cycleId ?? null) : null,
      p_inputs: stepB ? stepBInputs(input) : null,
    });
    if (created.error) return { error: friendly(created.error) };

    const edited = input.edited.replace(/\r\n/g, "\n").trim();
    if (edited && edited !== draft.text.trim()) {
      const { error } = await db.rpc("edit_draft", { p_draft: created.data, p_body: edited });
      if (error) {
        revalidatePath(`/matters/${input.matterId}`);
        return { error: `The draft was saved as UOA OS made it, but your changes were not: ${friendly(error)} Fix them on the Drafts tab.` };
      }
    }
  } catch (e) {
    return { error: problem(e) };
  }
  revalidatePath(`/matters/${input.matterId}`);
  revalidatePath("/");
  return {};
}

export async function saveDraft(form: FormData) {
  await run(form, (db) => db.rpc("edit_draft", { p_draft: text(form, "draft_id"), p_body: text(form, "body") }));
}

export async function reviewDraft(form: FormData) {
  await run(form, (db) =>
    db.rpc("review_draft", { p_draft: text(form, "draft_id"), p_decision: text(form, "decision"), p_note: optional(form, "note") }),
  );
}

/** Letter templates (AI drafts) or client message templates (Outbox). */
function templateTable(form: FormData) {
  return text(form, "table") === "message_templates" ? "message_templates" : "draft_templates";
}

export async function saveTemplate(form: FormData) {
  await run(form, (db) => db.from(templateTable(form)).update({ body: text(form, "body") }).eq("kind", text(form, "kind")));
}

export async function approveTemplate(form: FormData) {
  await run(form, (db) =>
    db.from(templateTable(form)).update({ attorney_approved: text(form, "value") === "true" }).eq("kind", text(form, "kind")),
  );
}

// Outbox (Increment 4, Steps 2-3): staff send each message themselves, then record it.
export async function markMessageSent(form: FormData) {
  await run(form, (db) => db.rpc("mark_message_sent", { p_message: text(form, "message_id"), p_via: text(form, "via") }));
}

export async function cancelMessage(form: FormData) {
  await run(form, (db) => db.rpc("cancel_message", { p_message: text(form, "message_id"), p_reason: text(form, "reason") }));
}

/**
 * Runs the daily client follow-up check now. It runs as the system (like the
 * daily job), so it never counts as activity on a matter; staff only.
 */
export async function checkClientFollowups(form: FormData) {
  await run(form, async () => {
    const { staff } = await requireStaff();
    if (!staff || !["principal", "attorney", "paralegal", "docketing"].includes(staff.role)) {
      throw new Error("Only the attorney, principal, paralegal or docketing staff can do this.");
    }
    return createAdminClient().rpc("queue_client_followups");
  });
}

// Invoices (Increment 4, Step 4). The attorney approves; the billing tool sends.
function money(form: FormData, key: string): number | null {
  const raw = text(form, key);
  if (!raw) return null;
  const cents = parseMoney(raw);
  if (cents === null) throw new Error("Enter the amount in dollars, for example 1500 or 1,500.00.");
  return cents;
}

export async function setInvoiceAmount(form: FormData) {
  await run(form, (db) =>
    db.rpc("set_invoice_amount", { p_invoice: text(form, "invoice_id"), p_amount_cents: money(form, "amount"), p_note: optional(form, "note") }),
  );
}

export async function approveInvoice(form: FormData) {
  await run(form, (db) => db.rpc("approve_invoice", { p_invoice: text(form, "invoice_id") }));
}

export async function recordInvoiceSent(form: FormData) {
  await run(form, (db) => db.rpc("record_invoice_sent", { p_invoice: text(form, "invoice_id"), p_billing_ref: text(form, "billing_ref") }));
}

export async function voidInvoice(form: FormData) {
  await run(form, (db) => db.rpc("void_invoice", { p_invoice: text(form, "invoice_id"), p_reason: text(form, "reason") }));
}

export async function saveFeePhase(form: FormData) {
  await run(form, (db) =>
    db.rpc("save_fee_phase", {
      p_phase: text(form, "phase_id"),
      p_label: text(form, "label"),
      p_amount_cents: money(form, "amount"),
      p_active: text(form, "active") === "true",
    }),
  );
}

export async function addFeePhase(form: FormData) {
  await run(form, (db) =>
    db.rpc("add_fee_phase", {
      p_matter_type: text(form, "matter_type"),
      p_trigger: text(form, "trigger"),
      p_label: text(form, "label"),
      p_amount_cents: money(form, "amount"),
    }),
  );
}

// ---------------------------------------------------------------------------
// Client documents (Increment 2; decision #31)
// ---------------------------------------------------------------------------
export type DocRequestResult = { error?: string; link?: string; code?: string; email?: string } | null;

/**
 * Creates a request and returns the upload link, the code and the email text
 * ONCE. Only their hashes are stored, so they can't be shown again.
 */
export async function createDocRequest(_prev: DocRequestResult, form: FormData): Promise<DocRequestResult> {
  const matterId = text(form, "matter_id");
  const items = form.getAll("item").map(String);
  const due = text(form, "due_date");
  const link = newLink();
  const db = await createClient();
  const { data: requestId, error } = await db.rpc("create_doc_request", {
    p_matter: matterId,
    p_party: optional(form, "party_id"),
    p_items: items,
    p_due: due || null,
    p_token_hash: link.tokenHash,
    p_code_hash: link.codeHash,
  });
  if (error) return { error: friendly(error) };

  const [{ data: template }, { data: matter }, { data: labels }, { data: request }] = await Promise.all([
    db.from("message_templates").select("body").eq("kind", "documents_request").single(),
    db.from("matters").select("attorney:profiles!matters_attorney_id_fkey(display_name)").eq("id", matterId).single(),
    db.from("checklist_items").select("label").in("id", items).order("created_at"),
    db.from("doc_requests").select("expires_at").eq("id", requestId).single(),
  ]);
  const host = (await headers()).get("host");
  const origin = process.env.NEXT_PUBLIC_APP_URL || (host ? `https://${host}` : "");
  const url = `${origin}/upload/${link.token}`;
  const expires = request?.expires_at ? formatDateTime(request.expires_at) : "";
  const attorney = (matter?.attorney as unknown as { display_name?: string } | null)?.display_name ?? null;
  const email = fillFirmBlanks(String(template?.body ?? ""), { today: new Date(), attorney })
    .replaceAll("[ITEM LIST]", (labels ?? []).map((l) => `- ${l.label}`).join("\n"))
    .replaceAll("[UPLOAD LINK]", url)
    .replaceAll("[LINK EXPIRES]", expires)
    .replaceAll("[DUE DATE]", formatDate(due));
  revalidatePath(`/matters/${matterId}`);
  return { link: url, code: link.code, email };
}

export async function cancelDocRequest(form: FormData) {
  await run(form, (db) => db.rpc("cancel_doc_request", { p_request: text(form, "request_id"), p_reason: text(form, "reason") }));
}

export async function reviewDocument(form: FormData) {
  await run(form, (db) =>
    db.rpc("review_document", { p_document: text(form, "document_id"), p_decision: text(form, "decision"), p_reason: optional(form, "reason") }),
  );
}
