import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Button, Loading, PageHeader } from "@/components/ui";
import { FilterChips, filterHref } from "@/components/filter-chips";
import { LinkPending } from "@/components/link-pending";
import { inputClass } from "@/components/styles";
import { requireStaff } from "@/lib/session";
import { daysBetween, describeDue, today } from "@/lib/deadlines";
import { MATTER_STATUS, MATTER_TYPES, label, stageName } from "@/lib/labels";

export const metadata: Metadata = { title: "Matters" };

export default function MattersPage({ searchParams }: PageProps<"/matters">) {
  return (
    <>
      <PageHeader eyebrow="Work" icon="briefcase" title="Matters" />
      <Suspense fallback={<Loading />}>
        <MatterList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const SHOW = { open: "Open", closed: "Closed", all: "All" } as const;
const FOCUS = { all: "Everything", needs: "Needs the attorney", soon: "Deadline in 7 days", urgent: "Urgent" } as const;
const DEFAULTS = { show: "open", focus: "all", type: "", q: "" };

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

async function MatterList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = {
    show: one(sp.show) in SHOW ? one(sp.show) : "open",
    focus: one(sp.focus) in FOCUS ? one(sp.focus) : "all",
    type: one(sp.type) in MATTER_TYPES ? one(sp.type) : "",
    q: one(sp.q),
  };
  const { supabase } = await requireStaff();
  const [{ data: matters }, { data: deadlines }, { data: gates }] = await Promise.all([
    supabase.from("matters").select("id, code, summary, matter_type, status, stage, urgent, test_data").order("code"),
    supabase.from("deadlines").select("matter_id, title, due_date, kind").eq("status", "open").order("due_date"),
    supabase.from("gates").select("matter_id, stage").is("cycle_id", null),
  ]);
  const now = today();
  const all = matters ?? [];
  const isOpen = (m: { status: string }) => m.status === "prospect" || m.status === "active";
  const nextOf = (id: string) => deadlines?.find((d) => d.matter_id === id && d.kind !== "review");
  // Waiting on the attorney: a stage approval, a deadline to verify, or a notice to review.
  const needs = (m: { id: string; stage: number }) =>
    ([2, 3, 5, 6].includes(m.stage) && !gates?.some((g) => g.matter_id === m.id && g.stage === m.stage)) ||
    Boolean(deadlines?.some((d) => d.matter_id === m.id && d.kind === "review"));

  const passShow = (m: (typeof all)[number], show: string) => show === "all" || (show === "open") === isOpen(m);
  const passFocus = (m: (typeof all)[number], focus: string) =>
    focus === "all" ||
    (focus === "urgent" && m.urgent) ||
    (focus === "needs" && isOpen(m) && needs(m)) ||
    (focus === "soon" && (() => {
      const n = nextOf(m.id);
      return Boolean(n && daysBetween(now, n.due_date) <= 7);
    })());
  const needle = f.q.toLowerCase();
  const passQuery = (m: (typeof all)[number]) =>
    !needle || [m.code, m.summary, label(MATTER_TYPES, m.matter_type)].some((v) => String(v ?? "").toLowerCase().includes(needle));
  const count = (g: Partial<typeof f>) => {
    const t = { ...f, ...g };
    return all.filter((m) => passShow(m, t.show) && passFocus(m, t.focus) && (!t.type || m.matter_type === t.type) && passQuery(m)).length;
  };
  const shown = all.filter((m) => passShow(m, f.show) && passFocus(m, f.focus) && (!f.type || m.matter_type === f.type) && passQuery(m));
  const go = (g: Partial<typeof f>) => filterHref("/matters", { ...f, ...g }, DEFAULTS);
  const filtered = f.show !== "open" || f.focus !== "all" || f.type || f.q;

  return (
    <>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <FilterChips label="Show" active={f.show} href={(v) => go({ show: v })} options={Object.entries(SHOW).map(([v, l]) => ({ value: v, label: l, count: count({ show: v }) }))} />
        <FilterChips label="Focus" active={f.focus} href={(v) => go({ focus: v })} options={Object.entries(FOCUS).map(([v, l]) => ({ value: v, label: l, count: count({ focus: v }) }))} />
        <FilterChips
          label="Type"
          active={f.type}
          href={(v) => go({ type: v })}
          options={[{ value: "", label: "All", count: count({ type: "" }) }, ...Object.entries(MATTER_TYPES).map(([v, l]) => ({ value: v, label: l, count: count({ type: v }) }))]}
        />
        <form action="/matters" role="search" className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          {f.show !== "open" && <input type="hidden" name="show" value={f.show} />}
          {f.focus !== "all" && <input type="hidden" name="focus" value={f.focus} />}
          {f.type && <input type="hidden" name="type" value={f.type} />}
          <input name="q" type="search" defaultValue={f.q} placeholder="Code, summary or type" aria-label="Search matters" className={`${inputClass} w-64`} />
          <Button>Search</Button>
          {filtered && (
            <Link href="/matters" className="text-sm font-medium text-slate-600 hover:underline">
              Clear filters
            </Link>
          )}
        </form>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900">
          {shown.length === 1 ? "1 matter" : `${shown.length} matters`}
        </h2>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">{all.length ? "No matter matches these filters." : "No matters yet."}</p>
        ) : (
          <ul className="stagger divide-y divide-slate-100">
            {shown.map((m) => {
              const next = nextOf(m.id);
              const left = next ? daysBetween(now, next.due_date) : null;
              return (
                <li key={m.id}>
                  <Link href={`/matters/${m.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-slate-50">
                    <span className="min-w-0 flex-1 basis-60">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-navy-800 group-hover:underline">{m.code}</strong>
                        {m.urgent && <Badge tone="red">Urgent</Badge>}
                        {m.test_data && <Badge tone="gray">Test</Badge>}
                        {isOpen(m) && needs(m) && <Badge tone="gold">Needs the attorney</Badge>}
                        <LinkPending className="h-3 w-3" />
                      </span>
                      <span className="block truncate text-sm text-slate-600">{m.summary}</span>
                      <span className="block text-xs text-slate-500">{label(MATTER_TYPES, m.matter_type)}</span>
                    </span>
                    <span className="w-44 shrink-0">
                      <span className="block text-sm text-slate-900">
                        {m.stage}. {stageName(m.stage)}
                      </span>
                      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-navy-700" style={{ width: `${(m.stage / 11) * 100}%` }} />
                      </span>
                    </span>
                    <span className="w-48 shrink-0 text-sm">
                      {!isOpen(m) ? (
                        <Badge tone="gray">{label(MATTER_STATUS, m.status)}</Badge>
                      ) : next ? (
                        <>
                          <span className={`block font-medium ${left !== null && left <= 7 ? "text-red-700" : "text-slate-900"}`}>{describeDue(next.due_date, now)}</span>
                          <span className="block truncate text-xs text-slate-500">{next.title}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">No deadline</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
