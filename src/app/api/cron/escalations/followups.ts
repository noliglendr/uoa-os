// Daily follow-up email to staff (Increment 4, Step 1). Runs inside the daily
// job (route.ts). One email per person, listing their follow-ups; on business
// days only. Each item is recorded in followups_sent, so it is not sent again
// before its repeat period (receipts and tasks daily, stalled matters weekly).
// Staff only, matter codes only: nothing goes to a client.

import type { createAdminClient } from "@/lib/supabase/admin";
import { isBusinessDay } from "@/lib/deadlines";
import { sendEmail } from "@/lib/email";
import { dueToSend, overdueTaskFollowups, receiptFollowups, stalledFollowups, type Followup } from "@/lib/followups";

type Db = ReturnType<typeof createAdminClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export async function runFollowups(db: Db, emailOf: Map<string, string>, appUrl: string, now: string) {
  if (!isBusinessDay(now)) return { skipped: "not a business day" };

  const { data, error } = await db.rpc("followup_data");
  if (error) throw new Error(`followup_data: ${error.message}`);
  const settings = (data.settings ?? {}) as Record<string, unknown>;
  if (settings["followup.emails"] === false) return { skipped: "follow-up emails are off" };

  const matters = new Map<string, Row>((data.matters as Row[]).map((m) => [m.id, m]));
  const items: Followup[] = [
    ...receiptFollowups(data.awaiting_receipt as Row[], now, Number(settings["followup.receipt_business_days"] ?? 1)),
    ...stalledFollowups(data.matters as Row[], now, Number(settings["dashboard.stalled_days"] ?? 14)),
    ...overdueTaskFollowups(data.tasks as Row[], now),
  ].filter((i) => matters.has(i.matterId));
  const due = dueToSend(items, data.sent as Row[], now);
  if (due.length === 0) return { items: items.length, emails: 0 };

  // Who gets each item: its roles (every active user in them), plus the
  // matter's attorney of record when the attorney is listed.
  const staff = data.staff as { id: string; role: string }[];
  const byPerson = new Map<string, Followup[]>();
  for (const item of due) {
    const ids = new Set(staff.filter((p) => item.roles.includes(p.role)).map((p) => p.id));
    if (item.roles.includes("attorney")) ids.add(matters.get(item.matterId).attorney_id);
    for (const id of ids) byPerson.set(id, [...(byPerson.get(id) ?? []), item]);
  }

  // One email per person. An item counts as sent when every email holding it went out.
  const outcome = new Map<string, { recipients: number; delivered: boolean; failed: boolean; detail: string }>();
  let emails = 0;
  for (const [id, list] of byPerson) {
    const to = emailOf.get(id);
    if (!to) continue;
    const lines = list.map((i) => {
      const m = matters.get(i.matterId);
      return `- ${m.code}: ${i.title}\n  ${i.detail}\n  ${appUrl}/matters/${m.id}`;
    });
    const result = await sendEmail(
      [to],
      `[UOA OS] ${list.length} follow-up${list.length === 1 ? "" : "s"} for ${now}`,
      ["These items are late or stuck. Open each matter to act on it.", "", ...lines, "", `My work: ${appUrl}/`].join("\n"),
    );
    emails++;
    for (const i of list) {
      const o = outcome.get(i.key) ?? { recipients: 0, delivered: true, failed: false, detail: "" };
      outcome.set(i.key, {
        recipients: o.recipients + 1,
        delivered: o.delivered && result.delivered,
        failed: o.failed || result.failed,
        detail: result.failed ? result.detail : o.detail || result.detail,
      });
    }
  }

  // A failed row is overwritten by the retry on the next run (same day) or a new row (next day).
  const rows = due
    .filter((i) => outcome.has(i.key))
    .map((i) => ({ item_key: i.key, matter_id: i.matterId, sent_on: now, sent_at: new Date().toISOString(), ...outcome.get(i.key)! }));
  if (rows.length) {
    const { error: saveError } = await db.from("followups_sent").upsert(rows, { onConflict: "item_key,sent_on" });
    if (saveError) throw new Error(`followups_sent: ${saveError.message}`);
    // System event with no matter, so a reminder never counts as activity on a matter.
    await db.rpc("log_event", {
      p_event_type: "followup.emails_sent",
      p_entity_type: "followup",
      p_payload: { emails, items: rows.length, failed: rows.filter((r) => r.failed).length },
    });
  }
  return { items: items.length, sent: rows.length, emails };
}
