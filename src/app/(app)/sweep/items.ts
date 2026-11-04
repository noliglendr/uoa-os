import "server-only";
import { daysBetween, today } from "@/lib/deadlines";
import { FORUMS, label } from "@/lib/labels";

// What the weekly status sweep covers (redline 9), and which items are due.
export const SWEEP_DAYS = 7;

type Item = {
  key: string;
  entityType: "filing" | "matter";
  entityId: string;
  matterId: string;
  code: string;
  what: string;
  where: string;
  stage: number;
};

/** Raw sweep data, as returned by the sweep_data() database function. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SweepData = { matters: any[]; filings: any[]; checks: any[] };

/** Which cases the sweep covers, and which are due this week. */
export function buildSweep({ matters, filings, checks }: SweepData) {
  const open = new Map((matters ?? []).map((m) => [m.id, m]));
  const items: Item[] = [];
  for (const f of filings ?? []) {
    const m = open.get(f.matter_id);
    if (!m) continue;
    items.push({
      key: f.id,
      entityType: "filing",
      entityId: f.id,
      matterId: m.id,
      code: m.code,
      what: `${f.form_type}${f.ref_no ? ` · ${f.ref_no}` : ""}`,
      where: label(FORUMS, f.forum),
      stage: f.stage,
    });
  }
  // EOIR and federal matters are checked even before anything is filed (hearing dates, orders).
  for (const m of open.values()) {
    if (m.matter_type !== "eoir_litigation" && m.matter_type !== "federal") continue;
    if (items.some((i) => i.matterId === m.id && i.entityType === "filing")) continue;
    items.push({
      key: m.id,
      entityType: "matter",
      entityId: m.id,
      matterId: m.id,
      code: m.code,
      what: "Case information (hearing dates, orders)",
      where: m.matter_type === "federal" ? "Federal court" : "EOIR",
      stage: m.stage,
    });
  }
  const last = new Map<string, { at: string; actor: string; result: string; note: string | null }>();
  for (const c of checks ?? []) {
    if (c.entity_id && !last.has(c.entity_id)) {
      last.set(c.entity_id, { at: c.occurred_at, actor: c.actor_id, result: c.payload?.result, note: c.payload?.note });
    }
  }
  const now = today();
  const due = items.filter((i) => {
    const l = last.get(i.entityId);
    return !l || daysBetween(l.at.slice(0, 10), now) >= SWEEP_DAYS;
  });
  items.sort((a, b) => a.code.localeCompare(b.code));
  return { items, last, due };
}
