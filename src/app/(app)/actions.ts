"use server";

// Every change made from the app. Business rules (gates, R1, R3, R4, who may
// verify or approve) are enforced by the database; these actions only pass
// the user's request through and show the database's answer.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { computeDeadline, today, type DeadlineRule } from "@/lib/deadlines";

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
  revalidatePath(path);
  const [base] = path.split("?");
  redirect(message ? `${base}?error=${encodeURIComponent(message)}` : base);
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
    let value: unknown;
    try {
      value = JSON.parse(text(form, "value"));
    } catch {
      throw new Error('The value must be valid JSON (for example 7, true, "off" or [21, 14, 7]).');
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
