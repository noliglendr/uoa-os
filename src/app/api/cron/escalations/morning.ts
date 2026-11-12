// The attorney's morning email (runs inside the daily job, route.ts). On
// business days, one short summary to the principal and each attorney: what
// needs them and the deadlines in the next 7 days. Sent only when there is
// something to say, and once a day (recorded as a system event).
// Matter codes only: nothing about clients.

import type { createAdminClient } from "@/lib/supabase/admin";
import { daysBetween, isBusinessDay } from "@/lib/deadlines";
import { sendEmail } from "@/lib/email";
import { stalledFollowups } from "@/lib/followups";
import { morningEmail, worthSending, type MorningCounts } from "@/lib/morning";

type Db = ReturnType<typeof createAdminClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const GATE_STAGES = [2, 3, 5, 6];

export async function runMorningSummary(db: Db, emailOf: Map<string, string>, appUrl: string, now: string) {
  if (!isBusinessDay(now)) return { skipped: "not a business day" };

  const { data: done } = await db
    .from("event_log")
    .select("id")
    .eq("event_type", "morning.summary_sent")
    .gte("occurred_at", `${now}T00:00:00-12:00`)
    .contains("payload", { date: now })
    .limit(1);
  if (done?.length) return { skipped: "already sent today" };

  const [matters, gates, cycles, deadlines, drafts, thirdParty, invoices, untold, staff, quiet] = await Promise.all([
    db.from("matters").select("id, code, stage").in("status", ["prospect", "active"]),
    db.from("gates").select("matter_id, stage, cycle_id"),
    db.from("response_cycles").select("id, matter_id, stage").eq("status", "open"),
    db.from("deadlines").select("matter_id, title, kind, due_date, attorney_verified").eq("status", "open"),
    db.from("drafts").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    db.from("checklist_items").select("id", { count: "exact", head: true }).eq("third_party_draft", true).in("status", ["drafted", "attorney_review"]).is("voided_at", null),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "draft"),
    db.from("filings").select("id", { count: "exact", head: true }).not("decision", "is", null).is("client_informed_at", null).is("voided_at", null),
    db.from("profiles").select("id, role, active"),
    db.rpc("followup_data"),
  ]);
  for (const r of [matters, gates, cycles, deadlines]) if (r.error) throw new Error(r.error.message);

  const open = (matters.data ?? []) as Row[];
  const code = new Map(open.map((m) => [m.id, m.code]));
  const gateRows = (gates.data ?? []) as Row[];
  const hasGate = (matter: string, stage: number, cycle: string | null) => gateRows.some((g) => g.matter_id === matter && g.stage === stage && g.cycle_id === cycle);
  const live = ((deadlines.data ?? []) as Row[]).filter((d) => code.has(d.matter_id));
  const settings = (quiet.data?.settings ?? {}) as Record<string, unknown>;

  const counts: MorningCounts = {
    approvals:
      open.filter((m) => GATE_STAGES.includes(m.stage) && !hasGate(m.id, m.stage, null)).length +
      ((cycles.data ?? []) as Row[]).filter((c) => code.has(c.matter_id) && (c.stage === 5 || c.stage === 6) && !hasGate(c.matter_id, c.stage, c.id)).length,
    deadlinesToVerify: live.filter((d) => d.kind !== "review" && !d.attorney_verified).length,
    noticesToReview: live.filter((d) => d.kind === "review").length,
    draftsToReview: (drafts.count ?? 0) + (thirdParty.count ?? 0),
    invoicesToApprove: invoices.count ?? 0,
    decisionsToTell: untold.count ?? 0,
    dueSoon: live
      .filter((d) => d.kind !== "review" && daysBetween(now, d.due_date) <= 7)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map((d) => ({ code: code.get(d.matter_id), title: d.title, due: d.due_date, daysLeft: daysBetween(now, d.due_date) })),
    stalled: quiet.error ? 0 : stalledFollowups((quiet.data.matters ?? []) as Row[], now, Number(settings["dashboard.stalled_days"] ?? 14)).length,
  };
  if (!worthSending(counts)) return { skipped: "nothing to report" };

  const to = ((staff.data ?? []) as Row[])
    .filter((p) => p.active && (p.role === "principal" || p.role === "attorney"))
    .map((p) => emailOf.get(p.id))
    .filter((e): e is string => Boolean(e));
  if (to.length === 0) return { skipped: "no attorney email" };

  const { subject, body } = morningEmail(counts, now, appUrl);
  const result = await sendEmail(to, subject, body);
  if (!result.failed) {
    await db.rpc("log_event", {
      p_event_type: "morning.summary_sent",
      p_entity_type: "followup",
      p_payload: { date: now, recipients: to.length, delivered: result.delivered },
    });
  }
  return { recipients: to.length, delivered: result.delivered, failed: result.failed };
}
