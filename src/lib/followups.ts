// Staff follow-ups (Increment 4, Step 1; docs/increment4-plan.md).
// Things inside the firm that are late or stuck. Used by "My work" and by the
// daily follow-up email (/api/cron/escalations). Staff only: nothing here
// goes to a client, and the email carries matter codes only.
// Unit tests: followups.test.ts.

import { addDays, daysBetween, isBusinessDay, today as firmDate } from "./deadlines.ts";

export type FollowupKind = "receipt" | "stalled" | "task" | "documents";

export type Followup = {
  /** Stable id: one email per key per repeat period. */
  key: string;
  kind: FollowupKind;
  matterId: string;
  title: string;
  detail: string;
  /** Who it goes to: these roles, plus the matter's attorney of record when "attorney" is listed. */
  roles: string[];
  /** Days between repeat emails while it stays open. */
  repeatDays: number;
};

/** A stored time (UTC) as a firm calendar date. Plain dates pass through. */
function dateOf(value: string): string {
  return value.length <= 10 ? value : firmDate(new Date(value));
}

/** The date `n` business days after `date` (weekends and federal holidays skipped). */
export function addBusinessDays(date: string, n: number): string {
  let day = date;
  for (let left = n; left > 0; ) {
    day = addDays(day, 1);
    if (isBusinessDay(day)) left--;
  }
  return day;
}

/** Form names only ("I-130"): other free text stays out of emails. */
const FORM_NAME = /^[A-Z]{1,4}-\d{1,4}[A-Z]?$/;

type Filing = { id: string; matter_id: string; form_type: string; filed_at: string };

/** Stage 7: a filed filing still has no receipt N business days after filing (receipts take 2-4 weeks). */
export function receiptFollowups(filings: Filing[], today: string, businessDays: number): Followup[] {
  return filings.flatMap((f) => {
    const filed = dateOf(f.filed_at);
    const due = addBusinessDays(filed, businessDays);
    if (today <= due) return [];
    return [{
      key: `receipt:${f.id}`,
      kind: "receipt" as const,
      matterId: f.matter_id,
      title: `No receipt yet: ${FORM_NAME.test(f.form_type) ? f.form_type : "filing"}`,
      detail: `Filed ${filed}; a receipt usually arrives by ${due}. Check the case online, then log the receipt`,
      roles: ["docketing", "paralegal", "principal"],
      repeatDays: 1,
    }];
  });
}

type Quiet = { id: string; last: string };

/** Nothing logged for `stalledDays` days. Repeats weekly while the matter stays quiet. */
export function stalledFollowups(matters: Quiet[], today: string, stalledDays: number): Followup[] {
  return matters.flatMap((m) => {
    const last = dateOf(m.last);
    const quiet = daysBetween(last, today);
    if (quiet < stalledDays) return [];
    return [{
      // A new quiet spell (after new activity) is a new follow-up.
      key: `stalled:${m.id}:${last}`,
      kind: "stalled" as const,
      matterId: m.id,
      title: "Stalled matter",
      detail: `Nothing logged for ${quiet} days (last change ${last})`,
      roles: ["attorney", "principal"],
      repeatDays: 7,
    }];
  });
}

type Task = { id: string; matter_id: string; title: string; owner_role: string; due_date: string | null };

/** An open task past its due date goes to the task's role (attorney tasks: the attorney of record). */
export function overdueTaskFollowups(tasks: Task[], today: string): Followup[] {
  return tasks.flatMap((t) => {
    if (!t.due_date || t.due_date >= today) return [];
    const late = daysBetween(t.due_date, today);
    return [{
      key: `task:${t.id}`,
      kind: "task" as const,
      matterId: t.matter_id,
      title: `Overdue task: ${t.title}`,
      detail: `Due ${t.due_date} (${late} ${late === 1 ? "day" : "days"} late)`,
      roles: t.owner_role === "attorney" ? ["attorney", "principal"] : [t.owner_role],
      repeatDays: 1,
    }];
  });
}

type DocRequest = { due_date: string; items: { item: { id: string; matter_id: string; label: string; status: string; voided_at: string | null } | null }[] };

/**
 * Increment 2: a document still "requested" `overdueDays` after its request's
 * due date (the latest due date when it was asked for more than once). Shown
 * on "My work" only.
 */
export function documentFollowups(requests: DocRequest[], today: string, overdueDays: number): Followup[] {
  const latest = new Map<string, { due: string; matterId: string; label: string }>();
  for (const r of requests) {
    for (const { item } of r.items) {
      if (!item || item.voided_at || item.status !== "requested") continue;
      const seen = latest.get(item.id);
      if (!seen || r.due_date > seen.due) latest.set(item.id, { due: r.due_date, matterId: item.matter_id, label: item.label });
    }
  }
  return [...latest].flatMap(([id, x]) => {
    const late = daysBetween(x.due, today);
    if (late < overdueDays) return [];
    return [{
      key: `documents:${id}`,
      kind: "documents" as const,
      matterId: x.matterId,
      title: `Document overdue: ${x.label}`,
      detail: `Due ${x.due} (${late} days late); the client follow-up is in the Client outbox`,
      roles: ["paralegal", "attorney", "principal"],
      repeatDays: 7,
    }];
  });
}

/** Items to email today: never sent, or last sent at least `repeatDays` ago. */
export function dueToSend(items: Followup[], sent: { key: string; sent_on: string }[], today: string): Followup[] {
  const last = new Map<string, string>();
  for (const s of sent) if (!last.has(s.key) || s.sent_on > last.get(s.key)!) last.set(s.key, s.sent_on);
  return items.filter((i) => {
    const on = last.get(i.key);
    return !on || daysBetween(on, today) >= i.repeatDays;
  });
}
