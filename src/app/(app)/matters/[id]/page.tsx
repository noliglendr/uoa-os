import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Badge, ErrorBanner } from "@/components/ui";
import { MatterSkeleton } from "@/components/skeleton";
import { LinkPending } from "@/components/link-pending";
import { Icon } from "@/components/icons";
import { requireStaff, isAttorney } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { describeDue, today } from "@/lib/deadlines";
import { GATE_LABELS, MATTER_STATUS, MATTER_TYPES, STAGES, formatDate, label } from "@/lib/labels";
import {
  AppearancesCard,
  ChecklistCard,
  CyclesCard,
  DeadlinesCard,
  FilingsCard,
  HistoryCard,
  NextStepCard,
  NoticesCard,
  PartiesCard,
  TasksCard,
  type MatterData,
} from "./sections";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "notices", label: "Notices" },
  { id: "filings", label: "Filings & responses" },
  { id: "evidence", label: "Evidence" },
  { id: "parties", label: "Parties" },
  { id: "history", label: "History" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function MatterPage({ params, searchParams }: PageProps<"/matters/[id]">) {
  return (
    <>
      <Link href="/matters" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <Icon name="arrowLeft" /> All matters
      </Link>
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<MatterSkeleton />}>
        <Matter params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Matter({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const requested = (await searchParams).tab;
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "overview";
  // One database call for the whole matter, alongside the sign-in check.
  const supabase = await createClient();
  const [{ staff }, { data: page, error }] = await Promise.all([requireStaff(), supabase.rpc("matter_page", { p_matter: id })]);
  if (error) throw error;
  if (!page) notFound();
  const matter = page.matter;

  const data: MatterData = {
    matter,
    attorney: isAttorney(staff),
    checks: page.checks,
    closure: page.closure,
    gates: page.gates,
    parties: page.parties,
    appearances: page.appearances,
    filings: page.filings,
    cycles: page.cycles,
    cycleChecks: page.cycle_checks,
    notices: page.notices,
    deadlines: page.deadlines,
    checklist: page.checklist,
    tasks: page.tasks,
    events: page.events,
    names: Object.fromEntries((page.profiles as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name])),
    rules: page.rules,
    back: `/matters/${id}?tab=${tab}`,
  };

  const now = today();
  const openDeadlines = data.deadlines.filter((x) => x.status === "open");
  const evidenceOpen = data.checklist.filter((i) => i.cycle_id === null && !["received", "drafted", "approved", "waived"].includes(i.status)).length;
  const openCycles = data.cycles.filter((c) => c.status === "open");
  const counts: Partial<Record<TabId, { n: number; alert?: boolean }>> = {
    overview: { n: openDeadlines.length + data.tasks.length },
    notices: { n: data.notices.length, alert: openDeadlines.some((x) => x.kind === "review") },
    filings: { n: data.filings.length, alert: openCycles.length > 0 },
    evidence: { n: evidenceOpen, alert: evidenceOpen > 0 },
    parties: { n: data.parties.length, alert: data.parties.some((p) => !p.conflict_cleared) },
    history: { n: data.events.length },
  };

  return (
    <>
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{matter.code}</h1>
              <Badge tone={matter.status === "active" ? "green" : matter.status === "prospect" ? "blue" : "gray"}>{label(MATTER_STATUS, matter.status)}</Badge>
              {matter.urgent && <Badge tone="red">Urgent</Badge>}
              {matter.hard_deadline && <Badge tone="gold">Hard deadline</Badge>}
              {matter.legal_hold && <Badge tone="red">Legal hold</Badge>}
            </div>
            <p className="mt-1 text-slate-600">{matter.summary}</p>
          </div>
          <Badge>{label(MATTER_TYPES, matter.matter_type)}</Badge>
        </div>
        <StageBar stage={matter.stage} closed={matter.status === "closed"} />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-5">
          <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Matter sections">
            <ul className="flex min-w-max gap-1 border-b border-slate-200">
              {TABS.map((t) => {
                const active = t.id === tab;
                const c = counts[t.id];
                return (
                  <li key={t.id}>
                    <Link
                      href={`/matters/${id}?tab=${t.id}`}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium ${
                        active ? "border-navy-800 text-navy-900" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                      }`}
                    >
                      {t.label}
                      <LinkPending className="h-3 w-3" />
                      {c && c.n > 0 && (
                        <span className={`rounded-full px-1.5 text-xs ${c.alert ? "bg-gold-100 text-gold-600" : "bg-slate-100 text-slate-600"}`}>{c.n}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {tab === "overview" && (
            <>
              <NextStepCard d={data} />
              {openCycles.map((c) => (
                <Link key={c.id} href={`/matters/${id}?tab=filings`} className="flex items-center gap-3 rounded-xl border border-gold-300 bg-gold-100/60 px-4 py-3 text-sm hover:bg-gold-100">
                  <Icon name="alert" className="h-5 w-5 text-gold-600" />
                  <span className="flex-1">
                    <strong>{c.kind.toUpperCase()} response in progress</strong>, stage {c.stage}: {STAGES.find((s) => s.n === c.stage)?.name}
                  </span>
                  <Icon name="arrowRight" />
                </Link>
              ))}
              <div className="grid gap-5 xl:grid-cols-2">
                <DeadlinesCard d={data} />
                <TasksCard d={data} />
              </div>
            </>
          )}
          {tab === "notices" && <NoticesCard d={data} />}
          {tab === "filings" && (
            <>
              <CyclesCard d={data} />
              <FilingsCard d={data} />
            </>
          )}
          {tab === "evidence" && <ChecklistCard d={data} />}
          {tab === "parties" && (
            <>
              <PartiesCard d={data} />
              <AppearancesCard d={data} />
            </>
          )}
          {tab === "history" && <HistoryCard d={data} />}
        </div>

        <aside className="order-first space-y-5 lg:order-none">
          <Summary d={data} now={now} />
        </aside>
      </div>
    </>
  );
}

function StageBar({ stage, closed }: { stage: number; closed: boolean }) {
  const current = STAGES.find((s) => s.n === stage)!;
  return (
    <div className="mt-5">
      <ol className="flex items-center" aria-label="Stages">
        {STAGES.map((s, i) => {
          const done = closed || s.n < stage;
          const here = !closed && s.n === stage;
          return (
            <li key={s.n} className="flex flex-1 items-center last:flex-none" title={`${s.n}. ${s.name}`}>
              <span
                aria-current={here ? "step" : undefined}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done ? "bg-navy-800 text-white" : here ? "bg-white text-navy-900 ring-2 ring-gold-400" : "bg-slate-100 text-slate-400"
                }`}
              >
                {done ? <Icon name="check" className="h-3.5 w-3.5" /> : s.n}
              </span>
              {i < STAGES.length - 1 && <span className={`mx-1 h-0.5 flex-1 rounded ${s.n < stage || closed ? "bg-navy-800" : "bg-slate-200"}`} />}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm">
        <span className="font-semibold text-slate-900">
          Stage {current.n}: {current.name}
        </span>
        <span className="text-slate-500"> · Owner: {current.owner}</span>
      </p>
    </div>
  );
}

function Summary({ d, now }: { d: MatterData; now: string }) {
  const m = d.matter;
  const next = d.deadlines.find((x) => x.status === "open");
  const gateWaiting = [2, 3, 5, 6].includes(m.stage) && !d.gates.some((g) => g.stage === m.stage && g.cycle_id === null);
  const failing = d.checks.filter((c) => !c.ok).length;
  const clients = d.parties.filter((p) => p.is_client).length;

  let nextStep: ReactNode;
  if (m.status === "closed") nextStep = "Closed";
  else if (m.status === "declined") nextStep = "Declined: send the non-engagement letter";
  else if (gateWaiting) nextStep = <span className="text-gold-600">{GATE_LABELS[m.stage]}</span>;
  else if (failing > 0) nextStep = `${failing} exit check${failing > 1 ? "s" : ""} to complete`;
  else nextStep = `Ready to move to stage ${m.stage + 1}`;

  return (
    <section className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm shadow-sm">
      <h2 className="px-4 py-3 text-sm font-semibold text-slate-900">Summary</h2>
      <Row label="Next step">{nextStep}</Row>
      <Row label="Nearest deadline">
        {next ? (
          <>
            <span className="font-medium">{formatDate(next.due_date)}</span>{" "}
            <span className={next.due_date < now ? "text-red-600" : "text-slate-500"}>({describeDue(next.due_date, now)})</span>
            <div className="text-xs text-slate-500">{next.title}</div>
          </>
        ) : (
          <span className="text-slate-500">None open</span>
        )}
      </Row>
      <Row label="Open tasks">{d.tasks.length}</Row>
      <Row label="Attorney of record">{d.names[m.attorney_id] ?? "—"}</Row>
      <Row label="Clients">{clients}</Row>
      <Row label="Filings">{d.filings.length}</Row>
      <Row label="Opened">{formatDate(m.created_at)}</Row>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 px-4 py-2.5">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{children}</span>
    </div>
  );
}
