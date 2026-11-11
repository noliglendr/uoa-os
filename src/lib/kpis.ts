// Firm dashboard: revenue and KPIs (Phase 1 brief, capability 7; decision #30).
// Pure functions over rows the page reads (matter codes and numbers only, no
// client data). Unit tests: kpis.test.ts.

import { today as firmDate } from "./deadlines.ts";
import { addBusinessDays } from "./followups.ts";

const DAY = 86400000;

/** A stored time (UTC) as a firm calendar date. Plain dates pass through. */
export function dateOf(value: string): string {
  return value.length <= 10 ? value : firmDate(new Date(value));
}

/** The last `n` months up to the one holding `today`, oldest first ("2026-11"). */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

function days(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Share as a whole percent, or null when there is nothing to count. */
export function percent(part: number, whole: number): number | null {
  return whole ? Math.round((part / whole) * 100) : null;
}

// ---------------------------------------------------------------------------
// Matters
// ---------------------------------------------------------------------------
type Matter = { id: string; created_at: string };
type StageEvent = { matter_id: string; occurred_at: string; from: number; to: number };

export function mattersByMonth(matters: Matter[], closed: { occurred_at: string }[], months: string[]) {
  return months.map((month) => ({
    month,
    opened: matters.filter((m) => dateOf(m.created_at).startsWith(month)).length,
    closed: closed.filter((e) => dateOf(e.occurred_at).startsWith(month)).length,
  }));
}

/** When each matter entered each stage: stage 1 when it was opened, then each stage change. */
export function stageEntries(matters: Matter[], events: StageEvent[]): Map<string, Map<number, string>> {
  const out = new Map<string, Map<number, string>>();
  for (const m of matters) out.set(m.id, new Map([[1, m.created_at]]));
  for (const e of [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
    out.get(e.matter_id)?.set(e.to, e.occurred_at);
  }
  return out;
}

/** Average days a matter spends in each stage it has left (stages 1-10). */
export function stageDurations(matters: Matter[], events: StageEvent[]) {
  const entered = new Map<string, Map<number, string>>();
  for (const m of matters) entered.set(m.id, new Map([[1, m.created_at]]));
  const spent = new Map<number, number[]>();
  for (const e of [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
    const map = entered.get(e.matter_id);
    if (!map) continue;
    const start = map.get(e.from);
    if (start) spent.set(e.from, [...(spent.get(e.from) ?? []), days(start, e.occurred_at)]);
    map.set(e.to, e.occurred_at);
  }
  return Array.from({ length: 10 }, (_, i) => i + 1).map((stage) => ({
    stage,
    avgDays: average(spent.get(stage) ?? []),
    matters: (spent.get(stage) ?? []).length,
  }));
}

// ---------------------------------------------------------------------------
// Deadlines: the most important number. Response deadlines only (appointments
// are attended, review placeholders are internal).
// ---------------------------------------------------------------------------
type Deadline = { kind: string; status: string; due_date: string; completed_at: string | null; voided_at?: string | null };

export function deadlineRecord(deadlines: Deadline[], today: string, since: string) {
  let onTime = 0;
  let late = 0;
  let overdue = 0;
  for (const d of deadlines) {
    if (d.kind !== "response" || d.voided_at || d.status === "cancelled" || d.due_date < since) continue;
    if (d.status === "met") {
      if (d.completed_at && dateOf(d.completed_at) > d.due_date) late++;
      else onTime++;
    } else if (d.status === "missed") late++;
    else if (d.status === "open" && d.due_date < today) overdue++;
  }
  const counted = onTime + late + overdue;
  return { onTime, late, overdue, counted, rate: percent(onTime, counted) };
}

// ---------------------------------------------------------------------------
// Receipts: logged within N business days of filing (stage 7 rule).
// ---------------------------------------------------------------------------
type Filing = { filed_at: string | null; receipt_logged_at: string | null; decision?: string | null; voided_at?: string | null };

export function receiptRecord(filings: Filing[], today: string, since: string, businessDays: number) {
  let onTime = 0;
  let late = 0;
  let waiting = 0;
  for (const f of filings) {
    if (!f.filed_at || f.voided_at) continue;
    const filed = dateOf(f.filed_at);
    if (filed < since) continue;
    const due = addBusinessDays(filed, businessDays);
    if (f.receipt_logged_at) {
      if (dateOf(f.receipt_logged_at) <= due) onTime++;
      else late++;
    } else if (today > due) waiting++;
  }
  const counted = onTime + late + waiting;
  return { onTime, late, waiting, counted, rate: percent(onTime, counted) };
}

export function decisionCounts(filings: Filing[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of filings) if (f.decision && !f.voided_at) out[f.decision] = (out[f.decision] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------------------
// Attorney approvals: days from reaching a gate stage (2, 3, 5, 6) to approval.
// ---------------------------------------------------------------------------
type Gate = { matter_id: string; stage: number; cycle_id: string | null; approved_at: string };

export function approvalWait(gates: Gate[], entries: Map<string, Map<number, string>>) {
  const waits = gates.flatMap((g) => {
    const start = g.cycle_id ? undefined : entries.get(g.matter_id)?.get(g.stage);
    return start ? [Math.max(0, days(start, g.approved_at))] : [];
  });
  return { approvals: waits.length, avgDays: average(waits), maxDays: waits.length ? Math.max(...waits) : null };
}

// ---------------------------------------------------------------------------
// Client outbox: prepared messages sent within a day.
// ---------------------------------------------------------------------------
type Message = { status: string; created_at: string; sent_at: string | null };

export function outboxRecord(messages: Message[]) {
  const sent = messages.filter((m) => m.status === "sent" && m.sent_at);
  const withinDay = sent.filter((m) => days(m.created_at, m.sent_at!) <= 1).length;
  return {
    sent: sent.length,
    waiting: messages.filter((m) => m.status === "waiting").length,
    cancelled: messages.filter((m) => m.status === "cancelled").length,
    withinDayRate: percent(withinDay, sent.length),
  };
}

// ---------------------------------------------------------------------------
// Revenue: earned fees from UOA OS invoices. Trust (IOLTA) money is never here
// (assumption 23). Money collected lives in the billing tool (D22).
// ---------------------------------------------------------------------------
type Invoice = {
  status: string;
  amount_cents: number | null;
  approved_at: string | null;
  sent_at: string | null;
  matter_type: string;
};

export function revenue(invoices: Invoice[], months: string[]) {
  const billed = invoices.filter((i) => (i.status === "approved" || i.status === "sent") && i.amount_cents != null);
  const sum = (rows: Invoice[]) => rows.reduce((a, i) => a + (i.amount_cents ?? 0), 0);
  const byType: Record<string, number> = {};
  for (const i of billed) byType[i.matter_type] = (byType[i.matter_type] ?? 0) + (i.amount_cents ?? 0);
  return {
    byMonth: months.map((month) => ({
      month,
      cents: sum(billed.filter((i) => i.approved_at && dateOf(i.approved_at).startsWith(month))),
    })),
    byType,
    drafts: invoices.filter((i) => i.status === "draft").length,
    draftsWithoutAmount: invoices.filter((i) => i.status === "draft" && i.amount_cents == null).length,
    approvedNotEntered: sum(invoices.filter((i) => i.status === "approved")),
    totalBilled: sum(billed),
  };
}

/** The first day of the window: `n` months back from today's month. */
export function windowStart(months: string[]): string {
  return `${months[0]}-01`;
}
