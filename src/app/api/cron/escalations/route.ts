// Daily deadline reminders (R2). Called by Vercel Cron (vercel.json) with
// "Authorization: Bearer <CRON_SECRET>". Uses the service role: it is a
// system job, so its events are logged with no user (actor = system).
//
// For each open deadline, sends one email when a threshold in
// deadline.escalation_days (21, 14, 7, 3, 1) is reached, and records it in
// the escalations table so it is never sent twice. Recipients come from the
// escalation.recipients setting (D12).
//
// Also sends one alert per matter whose engagement is not signed by its
// engagement alert date (redline 3: early deadlines before engagement).

import { createAdminClient } from "@/lib/supabase/admin";
import { daysBetween, escalationDue, today } from "@/lib/deadlines";
import { sendEmail } from "@/lib/email";
import { stageName } from "@/lib/labels";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const now = today();

  const [{ data: settings }, { data: staff }, { data: deadlines, error }, { data: sent }] = await Promise.all([
    db.from("settings").select("key, value").in("key", ["deadline.escalation_days", "escalation.recipients"]),
    db.from("profiles").select("id, role, active"),
    db
      .from("deadlines")
      .select("id, title, due_date, raw_due_date, attorney_verified, matter:matters(id, code, stage, attorney_id, status)")
      .eq("status", "open"),
    db.from("escalations").select("deadline_id, days_before"),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const setting = (key: string) => settings?.find((s) => s.key === key)?.value;
  const thresholds: number[] = setting("deadline.escalation_days") ?? [21, 14, 7, 3, 1];
  const who: string[] = setting("escalation.recipients") ?? ["attorney_of_record", "principal", "docketing"];

  // Staff email addresses come from Supabase Auth (they are not stored in the workflow tables).
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const emailOf = new Map(users?.users.map((u) => [u.id, u.email ?? ""]) ?? []);
  const active = (staff ?? []).filter((p) => p.active);

  const results: { deadline: string; days_left: number; sent: number; delivered: boolean }[] = [];
  for (const d of deadlines ?? []) {
    const matter = Array.isArray(d.matter) ? d.matter[0] : d.matter;
    if (!matter || matter.status === "closed" || matter.status === "declined") continue;

    const daysLeft = daysBetween(now, d.due_date);
    const already = (sent ?? []).filter((s) => s.deadline_id === d.id).map((s) => s.days_before);
    const due = escalationDue(daysLeft, thresholds, already);
    if (!due) continue;

    const ids = new Set<string>();
    if (who.includes("attorney_of_record")) ids.add(matter.attorney_id);
    for (const p of active) if (who.includes(p.role)) ids.add(p.id);
    const to = [...ids].map((id) => emailOf.get(id)).filter((e): e is string => Boolean(e));

    const when = daysLeft < 0 ? `${-daysLeft} days OVERDUE` : daysLeft === 0 ? "due TODAY" : `due in ${daysLeft} days`;
    const subject = `[UOA OS] ${matter.code}: ${d.title} ${when}`;
    // No client data in emails: matter code and deadline only.
    const body = [
      `${matter.code} (stage ${matter.stage}: ${stageName(matter.stage)})`,
      `Deadline: ${d.title}`,
      `Due: ${d.due_date}${d.raw_due_date && d.raw_due_date !== d.due_date ? ` (file by ${d.raw_due_date})` : ""}`,
      d.attorney_verified ? "Verified by the attorney." : "NOT verified by the attorney yet.",
      "",
      `Open: ${appUrl}/matters/${matter.id}`,
    ].join("\n");

    const result = await sendEmail(to, subject, body);
    const { error: insertError } = await db.from("escalations").insert(
      due.markSent.map((t) => ({
        deadline_id: d.id,
        days_before: t,
        recipients: to,
        delivered: result.delivered,
        detail: t === due.send ? result.detail : `covered by the ${due.send}-day reminder`,
      })),
    );
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
    results.push({ deadline: d.id, days_left: daysLeft, sent: due.send, delivered: result.delivered });
  }

  // Engagement not signed by the alert date: alert the attorney once per matter.
  const [{ data: late }, { data: gates }, { data: alerted }] = await Promise.all([
    db.from("matters").select("id, code, attorney_id, engagement_alert_date").eq("status", "prospect").lte("engagement_alert_date", now),
    db.from("gates").select("matter_id").eq("stage", 2).is("cycle_id", null),
    db.from("event_log").select("matter_id").eq("event_type", "engagement.alert_sent"),
  ]);
  const engagementAlerts: string[] = [];
  for (const m of late ?? []) {
    if (gates?.some((g) => g.matter_id === m.id) || alerted?.some((e) => e.matter_id === m.id)) continue;
    const ids = new Set<string>([m.attorney_id]);
    for (const p of active) if (who.includes(p.role)) ids.add(p.id);
    const to = [...ids].map((id) => emailOf.get(id)).filter((e): e is string => Boolean(e));
    const result = await sendEmail(
      to,
      `[UOA OS] ${m.code}: engagement not signed by the alert date`,
      [
        `${m.code} has a deadline running, but the engagement is not signed.`,
        `Alert date: ${m.engagement_alert_date}`,
        "Get the retainer signed, or decline the matter (non-engagement letter).",
        "",
        `Open: ${appUrl}/matters/${m.id}`,
      ].join("\n"),
    );
    await db.rpc("log_event", {
      p_event_type: "engagement.alert_sent",
      p_entity_type: "matter",
      p_entity_id: m.id,
      p_matter_id: m.id,
      p_payload: { recipients: to.length, delivered: result.delivered, detail: result.detail },
    });
    engagementAlerts.push(m.code);
  }

  return Response.json({ date: now, reminders: results.length, results, engagement_alerts: engagementAlerts });
}
