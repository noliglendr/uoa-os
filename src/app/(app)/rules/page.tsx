import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Button, ErrorBanner, Hidden, Loading, PageHeader, inputClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { isAttorney, requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/labels";
import { updateRuleNote, verifyRule } from "../actions";

export const metadata: Metadata = { title: "Deadline rules" };

// D7: the attorney verifies each deadline rule here. Unverified rules warn on every deadline.
export default function RulesPage({ searchParams }: PageProps<"/rules">) {
  return (
    <>
      <PageHeader
        eyebrow="Firm · Decision D7"
        icon="scale"
        title="Deadline rules"
        description="UOA OS works out deadlines from these rules. The attorney checks and verifies each one before it is relied on. The date on a notice always wins over the rule."
      />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Rules searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rule = any;
type Filters = { status: string; forum: string; q: string };

const STATUS = { all: "All", open: "Not verified", done: "Verified" } as const;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** The page address for a set of filters (empty filters are left out). */
function href(f: Filters): string {
  const p = new URLSearchParams();
  if (f.status !== "all") p.set("status", f.status);
  if (f.forum) p.set("forum", f.forum);
  if (f.q) p.set("q", f.q);
  const s = p.toString();
  return s ? `/rules?${s}` : "/rules";
}

/** "30 days from the IJ decision (+3 if mailed)" */
function windowText(r: Rule): string {
  if (!r.days) return "Date on the notice";
  return `${r.days} days from ${String(r.starts_from ?? "").replace(/^./, (c) => c.toLowerCase())}${r.mailing_extension ? " (+3 if mailed)" : ""}`;
}

async function Rules({ searchParams }: { searchParams: PageProps<"/rules">["searchParams"] }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ staff }, { data, error }] = await Promise.all([requireStaff(), supabase.rpc("rules_page", {}, { get: true })]);
  if (error) throw new Error(error.message);
  const rules = (data.rules ?? []) as Rule[];
  const names = (data.names ?? {}) as Record<string, string>;
  const attorney = isAttorney(staff);

  const status = one(sp.status);
  const f: Filters = {
    status: status in STATUS ? status : "all",
    forum: one(sp.forum),
    q: one(sp.q),
  };
  const forums = [...new Set(rules.map((r) => String(r.forum)))];
  const verified = rules.filter((r) => r.attorney_verified).length;

  const q = f.q.toLowerCase();
  const shown = rules.filter(
    (r) =>
      (f.status === "all" || (f.status === "done") === Boolean(r.attorney_verified)) &&
      (!f.forum || r.forum === f.forum) &&
      (!q || [r.code, r.label, r.source, r.note, r.starts_from].some((v) => String(v ?? "").toLowerCase().includes(q))),
  );
  const count = (g: Partial<Filters>) => {
    const t = { ...f, ...g };
    return rules.filter((r) => (t.status === "all" || (t.status === "done") === Boolean(r.attorney_verified)) && (!t.forum || r.forum === t.forum)).length;
  };
  const back = href(f);
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 ${
      active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
    }`;

  return (
    <>
      {/* Progress */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-medium text-slate-900">
            {verified === rules.length ? "Every rule is verified." : `${verified} of ${rules.length} rules verified. ${rules.length - verified} still need the attorney's check.`}
          </p>
          {verified < rules.length && f.status !== "open" && (
            <Link href={href({ ...f, status: "open" })} className="text-sm font-medium text-navy-700 hover:underline">
              Show the ones to check →
            </Link>
          )}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rules.length ? (verified / rules.length) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
          {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => (
            <Link key={s} href={href({ ...f, status: s })} className={chip(f.status === s)}>
              {STATUS[s]} <span className="text-xs opacity-70">{count({ status: s })}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs font-semibold uppercase tracking-wide text-slate-500">Forum</span>
          <Link href={href({ ...f, forum: "" })} className={chip(!f.forum)}>
            All <span className="text-xs opacity-70">{count({ forum: "" })}</span>
          </Link>
          {forums.map((fo) => (
            <Link key={fo} href={href({ ...f, forum: fo })} className={chip(f.forum === fo)}>
              {fo} <span className="text-xs opacity-70">{count({ forum: fo })}</span>
            </Link>
          ))}
        </div>
        <form action="/rules" className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          {f.status !== "all" && <input type="hidden" name="status" value={f.status} />}
          {f.forum && <input type="hidden" name="forum" value={f.forum} />}
          <input name="q" defaultValue={f.q} placeholder="e.g. motion, I-290B, 1003.38" aria-label="Search rules" className={`${inputClass} w-64`} />
          <Button>Search</Button>
          {(f.q || f.forum || f.status !== "all") && (
            <Link href="/rules" className="text-sm font-medium text-slate-600 hover:underline">
              Clear filters
            </Link>
          )}
        </form>
      </div>

      {/* Rules */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900">
          {shown.length === rules.length ? `All rules (${rules.length})` : `Showing ${shown.length} of ${rules.length} rules`}
          <span className="ml-2 font-normal text-slate-500">· click a rule to check it</span>
        </h2>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No rules match these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((r) => (
              <li key={r.code}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    <span className="w-9 shrink-0 font-mono text-xs text-slate-500">{r.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">{r.label}</span>
                      <span className="block text-xs text-slate-500">{windowText(r)}</span>
                    </span>
                    <Badge tone="gray">{r.forum}</Badge>
                    {r.attorney_verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}
                  </summary>

                  <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:pl-16">
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <Item k="Window" v={r.days ? `${r.days} days` : "Date on the notice"} />
                      <Item k="Starts from" v={r.starts_from} />
                      <Item k="Extra 3 days if mailed" v={r.mailing_extension ? "Yes" : "No"} />
                      <Item k="Legal source" v={r.source} />
                      {r.kind === "appointment" && <Item k="Appointment" v={`Prep task ${r.prep_days} days before`} />}
                      <Item
                        k="Verified"
                        v={r.attorney_verified ? `Yes, by ${names[r.verified_by] ?? "?"}, ${formatDateTime(r.verified_at)}` : "Not yet"}
                      />
                    </dl>

                    <form action={updateRuleNote} className="flex flex-wrap items-end gap-2">
                      <Hidden values={{ back, code: r.code }} />
                      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                        <span className="font-medium text-slate-700">Note</span>
                        <input key={r.note ?? ""} name="note" defaultValue={r.note ?? ""} placeholder="e.g. exceptions, how to count" className={`${inputClass} w-full`} />
                      </label>
                      <Button>Save note</Button>
                    </form>

                    {attorney ? (
                      <form action={verifyRule}>
                        <Hidden values={{ back, code: r.code, value: String(!r.attorney_verified) }} />
                        <ConfirmButton
                          variant={r.attorney_verified ? "secondary" : "primary"}
                          confirm={
                            r.attorney_verified
                              ? `${r.code}: remove the verification? Deadlines from this rule will show a warning again.`
                              : `${r.code}: I checked "${windowText(r)}" against ${r.source}.\n\nVerify it? This is logged with your name and the time.`
                          }
                        >
                          {r.attorney_verified ? "Remove verification" : "Verify this rule"}
                        </ConfirmButton>
                      </form>
                    ) : (
                      !r.attorney_verified && <p className="text-xs text-slate-500">Only the attorney verifies rules.</p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className="text-slate-900">{v}</dd>
    </div>
  );
}
