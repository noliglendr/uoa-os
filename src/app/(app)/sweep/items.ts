import "server-only";
import type { createClient } from "@/lib/supabase/server";
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

export async function sweepItems(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: matters }, { data: filings }, { data: checks }] = await Promise.all([
    supabase.from("matters").select("id, code, matter_type, stage, status").in("status", ["prospect", "active"]),
    supabase.from("filings").select("id, matter_id, form_type, forum, ref_no, stage").not("filed_at", "is", null).is("decision", null),
    supabase
      .from("event_log")
      .select("entity_id, occurred_at, actor_id, payload")
      .eq("event_type", "sweep.checked")
      .order("occurred_at", { ascending: false })
      .limit(2000),
  ]);
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
