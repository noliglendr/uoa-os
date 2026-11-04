import Link from "next/link";
import { Suspense } from "react";
import { Badge, Button, Card, Empty, HeroChip, Hidden, PageHeader, Stat, type Tone } from "@/components/ui";
import { DashboardSkeleton } from "@/components/skeleton";
import { LinkPending } from "@/components/link-pending";
import { ConfirmButton } from "@/components/confirm-button";
import { Greeting } from "@/components/greeting";
import { Icon } from "@/components/icons";
import { buttonClass } from "@/components/styles";
import { requireStaff, isAttorney } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, describeDue, today } from "@/lib/deadlines";
import { GATE_LABELS, ROLE_LABELS, STAGES, formatDate, stageName } from "@/lib/labels";
import { approveGate, completeTask, updateDeadline } from "./actions";
import { buildSweep, type SweepData } from "./sweep/items";

// "My work": where am I needed, what is due, what is stuck.
export default function Dashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

// Rows come from dashboard_data() as JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

type Action = { kind: "gate"; stage: number; cycleId: string | null } | { kind: "verify"; deadlineId: string };

type WorkItem = {
  matterId: string;
  title: string;
  detail?: string;
  /** red = act today, amber = approval, blue = review */
  tone: "red" | "amber" | "blue";
  tab: string;
  action?: Action;
  due?: string | null;
};

const TONE_DOT = { red: "bg-red-500", amber: "bg-gold-400", blue: "bg-navy-400" } as const;
const TONE_ORDER = { red: 0, amber: 1, blue: 2 } as const;

async function DashboardContent() {
  // One database call for the whole screen, alongside the sign-in check.
  const supabase = await createClient();
  const [{ staff }, { data, error }, { data: staffList }] = await Promise.all([
    requireStaff(),
    supabase.rpc("dashboard_data"),
    supabase.rpc("staff_page"),
  ]);
  if (!staff) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Your account has no active role. Ask the principal to set up your access.
      </p>
    );
  }
  if (error || !data) throw error ?? new Error("Could not load the dashboard.");
  const attorney = isAttorney(staff);
  const sweep = buildSweep(data.sweep as SweepData);
  const lastActivity = data.last_activity as Record<string, string>;
  const gates = data.gates as Row[];

  const now = today();
  const all = data.matters as Row[];
  const open = all.filter((m) => m.status === "prospect" || m.status === "active");
  const byId = new Map<string, Row>(all.map((m) => [m.id, m]));
  const hasGate = (matterId: string, stage: number, cycleId: string | null = null) =>
    gates.some((g) => g.matter_id === matterId && g.stage === stage && g.cycle_id === cycleId);
  const openDeadlines = data.deadlines as Row[];
  const nextDue = (matterId: string) => openDeadlines.find((d) => d.matter_id === matterId)?.due_date ?? null;

  // Everything waiting on the attorney.
  const work: WorkItem[] = [];
  for (const m of open) {
    if ([2, 3, 5, 6].includes(m.stage) && !hasGate(m.id, m.stage)) {
      work.push({ matterId: m.id, title: GATE_LABELS[m.stage], detail: `Stage ${m.stage}: ${stageName(m.stage)}`, tone: "amber", tab: "overview", action: { kind: "gate", stage: m.stage, cycleId: null }, due: nextDue(m.id) });
    }
    if (m.stage <= 2 && m.engagement_alert_date && m.engagement_alert_date <= now && !hasGate(m.id, 2)) {
      work.push({ matterId: m.id, title: "Engagement not signed by the alert date", detail: `Alert date ${formatDate(m.engagement_alert_date)}`, tone: "red", tab: "overview", due: nextDue(m.id) });
    }
  }
  for (const c of data.cycles as Row[]) {
    if ((c.stage === 5 || c.stage === 6) && !hasGate(c.matter_id, c.stage, c.id)) {
      work.push({ matterId: c.matter_id, title: `${c.kind.toUpperCase()} response: ${GATE_LABELS[c.stage]}`, tone: "amber", tab: "filings", action: { kind: "gate", stage: c.stage, cycleId: c.id }, due: nextDue(c.matter_id) });
    }
  }
  for (const d of openDeadlines) {
    if (d.kind === "review") {
      work.push({ matterId: d.matter_id, title: d.title, detail: "Set a deadline or record “no deadline”", tone: "red", tab: "notices", due: d.due_date });
    } else if (!d.attorney_verified) {
      work.push({ matterId: d.matter_id, title: `Verify deadline: ${d.title}`, detail: `Computed due date ${formatDate(d.due_date)}${d.rule_code ? ` (rule ${d.rule_code})` : ""}`, tone: "amber", tab: "overview", action: { kind: "verify", deadlineId: d.id }, due: d.due_date });
    }
  }
  for (const i of data.drafts as Row[]) {
    work.push({ matterId: i.matter_id, title: `Review third-party draft: ${i.label}`, detail: "Before it goes out for signature", tone: "blue", tab: "filings", due: nextDue(i.matter_id) });
  }
  for (const f of data.untold as Row[]) {
    work.push({ matterId: f.matter_id, title: `Tell the client: ${f.form_type} ${f.decision}`, detail: "The attorney tells the client, not the system", tone: "red", tab: "filings" });
  }
  work.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  const upcoming = openDeadlines.filter((d) => daysBetween(now, d.due_date) <= 30);
  const dueThisWeek = openDeadlines.filter((d) => daysBetween(now, d.due_date) <= 7).length;

  const stalledDays = Number(data.stalled_days ?? 14);
  const stalled = open
    .map((m) => ({ m, last: (lastActivity[m.id] ?? m.stage_changed_at) as string }))
    .filter(({ last }) => daysBetween(last.slice(0, 10), now) >= stalledDays);

  const myTasks = (data.tasks as Row[]).filter(
    (t) => t.owner_role === staff.role || (staff.role === "principal" && t.owner_role === "attorney"),
  );

  const longDate = new Date(`${now}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const firstName = staff.displayName.split(/\s+/)[0];
  const nextDeadline = openDeadlines.find((x) => x.kind !== "review");

  // Each role opens on its own work (decision #17).
  const view: "attorney" | "admin" | "staff" | "intake" = attorney
    ? "attorney"
    : staff.role === "administrator"
      ? "admin"
      : staff.role === "intake"
        ? "intake"
        : "staff";
  const evidence = data.evidence_open as Row[];
  const atIntake = open.filter((m) => m.stage === 1);
  const team = (staffList ?? []) as Row[];
  const noTwoStep = team.filter((p) => p.active && p.mfa === false);
  const switchedOff = team.filter((p) => !p.active);

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const summary =
    view === "attorney"
      ? work.length === 0
        ? "Everything is up to date. Nothing is waiting for your approval."
        : `${plural(work.length, "item is", "items are")} waiting for your approval${nextDeadline ? `, and the next deadline is ${describeDue(nextDeadline.due_date, now)}` : ""}.`
      : view === "admin"
        ? `${plural(team.filter((p) => p.active).length, "person has", "people have")} access${noTwoStep.length ? `, and ${plural(noTwoStep.length, "has", "have")} not set up two-step sign-in yet` : ", all with two-step sign-in"}.`
        : view === "intake"
          ? `${plural(atIntake.length, "matter is", "matters are")} at intake. Check conflicts for each party, then move it to engagement.`
          : `You have ${plural(myTasks.length, "open task", "open tasks")}, ${plural(sweep.due.length, "sweep check", "sweep checks")} due this week and ${plural(evidence.length, "evidence item", "evidence items")} to collect.`;

  const tiles =
    view === "attorney" ? (
      <>
        <Stat label="Needs you" value={work.length} tone={work.length ? "amber" : "green"} hint="Approvals and reviews" />
        <Stat label="Due in 7 days" value={dueThisWeek} tone={dueThisWeek ? "red" : "green"} hint="Open deadlines" />
        <Stat label="Open matters" value={open.length} hint={`${all.length} in total`} />
        <Stat label="Stalled" value={stalled.length} tone={stalled.length ? "red" : "green"} hint={`No activity for ${stalledDays}+ days`} />
      </>
    ) : view === "admin" ? (
      <>
        <Stat label="Active staff" value={team.filter((p) => p.active).length} hint={`${switchedOff.length} switched off`} />
        <Stat label="No two-step yet" value={noTwoStep.length} tone={noTwoStep.length ? "red" : "green"} hint="Must set up the app" />
        <Stat label="With the attorney" value={work.length} tone={work.length ? "amber" : "green"} hint="Approvals waiting" />
        <Stat label="Stalled" value={stalled.length} tone={stalled.length ? "red" : "green"} hint={`No activity for ${stalledDays}+ days`} />
      </>
    ) : view === "intake" ? (
      <>
        <Stat label="At intake" value={atIntake.length} tone={atIntake.length ? "amber" : "green"} hint="Stage 1" />
        <Stat label="My tasks" value={myTasks.length} tone={myTasks.length ? "amber" : "green"} hint="Open" />
        <Stat label="Open matters" value={open.length} hint={`${all.length} in total`} />
        <Stat label="Due in 7 days" value={dueThisWeek} tone={dueThisWeek ? "red" : "green"} hint="Open deadlines" />
      </>
    ) : (
      <>
        <Stat label="My tasks" value={myTasks.length} tone={myTasks.length ? "amber" : "green"} hint="Open" />
        <Stat label="Sweep due" value={sweep.due.length} tone={sweep.due.length ? "amber" : "green"} hint="Checks this week" />
        <Stat label="Evidence to collect" value={evidence.length} tone={evidence.length ? "amber" : "green"} hint="Needed or requested" />
        <Stat label="Due in 7 days" value={dueThisWeek} tone={dueThisWeek ? "red" : "green"} hint="Open deadlines" />
      </>
    );

  const approvalsCard = (
    <>
          <div id="approvals" className="-mb-5 scroll-mt-24" />
          <Card
            title={attorney ? "Needs your approval" : "Waiting for the attorney"}
            description={attorney ? "Most urgent first. Every approval is permanent and logged with your name." : "Most urgent first. Only the attorney approves these; you can open each matter to follow it."}
            flush
          >
            {work.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-sm text-emerald-700">
                <Icon name="check" className="h-5 w-5" /> All clear. Nothing is waiting for the attorney.
              </div>
            ) : (
              <ul className="stagger divide-y divide-slate-100">
                {work.map((w, i) => {
                  const m = byId.get(w.matterId);
                  const href = `/matters/${w.matterId}?tab=${w.tab}`;
                  return (
                    <li key={i} className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 gap-3">
                        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[w.tone]}`} aria-hidden />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={href} className="font-semibold text-navy-800 hover:underline">
                              {m?.code}
                            </Link>
                            {m?.urgent && <Badge tone="red">Urgent</Badge>}
                            <span className="text-sm text-slate-900">{w.title}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {[m?.summary, w.detail].filter(Boolean).join(" · ")}
                            {w.due && <> · next deadline {describeDue(w.due, now)}</>}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2 pl-5 sm:pl-0">
                        {attorney && w.action?.kind === "gate" && (
                          <form action={approveGate}>
                            <Hidden values={{ back: "/", matter_id: w.matterId, stage: w.action.stage, cycle_id: w.action.cycleId }} />
                            <ConfirmButton confirm={`${m?.code}: ${w.title}?\n\nThis approval is permanent and is logged with your name and the time.`}>
                              <Icon name="check" /> Approve
                            </ConfirmButton>
                          </form>
                        )}
                        {attorney && w.action?.kind === "verify" && (
                          <form action={updateDeadline}>
                            <Hidden values={{ back: "/", deadline_id: w.action.deadlineId, field: "verify" }} />
                            <ConfirmButton confirm={`${m?.code}: ${w.title}\n\nConfirm you checked this date against the notice and the rule. This is logged with your name.`}>
                              <Icon name="check" /> Verify
                            </ConfirmButton>
                          </form>
                        )}
                        <Link href={href} className={buttonClass("secondary")}>
                          Open <LinkPending />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
    </>
  );

  const tasksCard = (
          <Card title={`My tasks · ${ROLE_LABELS[staff.role]}`} flush>
            {myTasks.length === 0 ? (
              <div className="p-4">
                <Empty>No open tasks.</Empty>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {myTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-20 shrink-0 text-xs text-slate-500">{t.due_date ? formatDate(t.due_date) : ""}</span>
                    <Link href={`/matters/${t.matter_id}`} className="min-w-0 flex-1 text-sm hover:underline">
                      <strong className="text-navy-800">{byId.get(t.matter_id)?.code}</strong> {t.title}
                    </Link>
                    <form action={completeTask}>
                      <Hidden values={{ back: "/", task_id: t.id }} />
                      <Button>Done</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
  );

  const evidenceCard = (
    <Card title="Evidence to collect" description="Checklist items still needed or requested, oldest first." flush>
      {evidence.length === 0 ? (
        <div className="flex items-center gap-2 p-4 text-sm text-emerald-700">
          <Icon name="check" className="h-5 w-5" /> Nothing outstanding.
        </div>
      ) : (
        <ul className="stagger divide-y divide-slate-100">
          {evidence.slice(0, 8).map((e, i) => (
            <li key={i}>
              <Link href={`/matters/${e.matter_id}?tab=evidence`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <strong className="w-20 shrink-0 text-sm text-navy-800">{byId.get(e.matter_id)?.code}</strong>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{e.label}</span>
                <Badge tone={e.status === "requested" ? "blue" : "amber"}>{e.status === "requested" ? "Requested" : "Needed"}</Badge>
                <span className="hidden w-20 text-right text-xs text-slate-500 sm:block">{e.owner === "third_party" ? "Third party" : e.owner === "firm" ? "Firm" : "Client"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const sweepDueCard = (
    <Card title="Sweep checks due this week" actions={<Link href="/sweep" className="text-xs font-medium text-navy-700 hover:underline">Open sweep →</Link>} flush>
      {sweep.due.length === 0 ? (
        <div className="flex items-center gap-2 p-4 text-sm text-emerald-700">
          <Icon name="check" className="h-5 w-5" /> Every pending case was checked this week.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sweep.due.slice(0, 6).map((i) => (
            <li key={i.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <strong className="w-20 shrink-0 text-navy-800">{i.code}</strong>
              <span className="min-w-0 flex-1 truncate text-slate-900">{i.what}</span>
              <span className="text-xs text-slate-500">{i.where}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const intakeCard = (
    <Card title="Matters at intake" description="Stage 1: check conflicts for every party, then move the matter to engagement." flush>
      {atIntake.length === 0 ? (
        <div className="p-4">
          <Empty>No matters at intake. Open one with “New matter”.</Empty>
        </div>
      ) : (
        <ul className="stagger divide-y divide-slate-100">
          {atIntake.map((m) => (
            <li key={m.id}>
              <Link href={`/matters/${m.id}?tab=parties`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <strong className="w-20 shrink-0 text-sm text-navy-800">{m.code}</strong>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{m.summary}</span>
                {m.urgent && <Badge tone="red">Urgent</Badge>}
                <span className={buttonClass("secondary")}>Conflicts →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const systemCard = (
    <Card title="Staff and sign-in" description="Everyone must set up two-step sign-in before using real data." actions={<Link href="/staff" className="text-xs font-medium text-navy-700 hover:underline">Staff page →</Link>} flush>
      <ul className="divide-y divide-slate-100">
        {team.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{p.display_name}</span>
            <span className="w-28 text-xs text-slate-500">{ROLE_LABELS[p.role] ?? p.role}</span>
            {!p.active ? <Badge tone="gray">Switched off</Badge> : p.mfa ? <Badge tone="green">Two-step on</Badge> : <Badge tone="red">No two-step</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );

  const leftColumn =
    view === "attorney" ? (
      <>
        {approvalsCard}
        {tasksCard}
      </>
    ) : view === "admin" ? (
      <>
        {systemCard}
        {approvalsCard}
      </>
    ) : view === "intake" ? (
      <>
        {intakeCard}
        {tasksCard}
      </>
    ) : (
      <>
        {tasksCard}
        {evidenceCard}
        {sweepDueCard}
        {approvalsCard}
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow={`My work · ${ROLE_LABELS[staff.role]} · ${longDate}`}
        title={<Greeting name={firstName} />}
        description={summary}
        meta={
          <>
            <HeroChip icon="briefcase">{open.length} open matters</HeroChip>
            <HeroChip icon="clock">{upcoming.length} deadlines in 30 days</HeroChip>
            {view !== "intake" && (
              <HeroChip icon="refresh">
                Sweep {sweep.items.length - sweep.due.length}/{sweep.items.length} done
              </HeroChip>
            )}
          </>
        }
        actions={
          <>
            {view === "attorney" && work.length > 0 && (
              <a href="#approvals" className={buttonClass("gold", "h-9")}>
                <Icon name="check" /> Review approvals
              </a>
            )}
            {view === "staff" && sweep.due.length > 0 && (
              <Link href="/sweep" className={buttonClass("gold", "h-9")}>
                <Icon name="refresh" /> Do this week&apos;s sweep
              </Link>
            )}
            {view === "admin" && (
              <Link href="/staff" className={buttonClass("gold", "h-9")}>
                <Icon name="users" /> Manage staff
              </Link>
            )}
            <Link href="/matters/new" className={buttonClass("light", "h-9")}>
              <Icon name="plus" /> New matter
            </Link>
          </>
        }
        overlap
      />

      <div className="stagger relative z-10 -mt-[4.5rem] grid grid-cols-2 gap-3 px-3 sm:px-5 lg:grid-cols-4">
        {tiles}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {leftColumn}
        </div>

        <div className="space-y-5">
          <Card title="Next 30 days" flush>
            {upcoming.length === 0 ? (
              <div className="p-4">
                <Empty>No open deadlines in the next 30 days.</Empty>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((d) => {
                  const left = daysBetween(now, d.due_date);
                  const date = new Date(`${d.due_date}T12:00:00`);
                  return (
                    <li key={d.id}>
                      <Link href={`/matters/${d.matter_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                        <span className={`flex w-11 shrink-0 flex-col items-center rounded-md py-1 ${left <= 7 ? "bg-red-50 text-red-700" : "bg-navy-50 text-navy-800"}`}>
                          <span className="text-[10px] font-semibold uppercase">{date.toLocaleDateString("en-US", { month: "short" })}</span>
                          <span className="text-base font-semibold leading-none">{date.getDate()}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-900">{d.title}</span>
                          <span className="block text-xs text-slate-500">
                            {byId.get(d.matter_id)?.code} · {describeDue(d.due_date, now)}
                          </span>
                        </span>
                        {d.attorney_verified ? (
                          <span title="Verified by the attorney" className="text-emerald-600">
                            <Icon name="check" />
                          </span>
                        ) : (
                          <Badge tone="amber">Verify</Badge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Matters by stage" actions={<Link href="/matters" className="text-xs font-medium text-navy-700 hover:underline">All matters →</Link>}>
            {open.length === 0 ? (
              <Empty>No open matters.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {STAGES.filter((s) => open.some((m) => m.stage === s.n)).map((s) => (
                  <li key={s.n} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-800">{s.n}</span>
                    <span className="flex-1 text-slate-700">{s.name}</span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {open
                        .filter((m) => m.stage === s.n)
                        .map((m) => (
                          <Link key={m.id} href={`/matters/${m.id}`}>
                            <Badge tone={m.urgent ? "red" : "blue"}>{m.code}</Badge>
                          </Link>
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Weekly status sweep" actions={<Link href="/sweep" className="text-xs font-medium text-navy-700 hover:underline">Open sweep →</Link>}>
            <SweepMeter done={sweep.items.length - sweep.due.length} total={sweep.items.length} />
          </Card>

          {stalled.length > 0 && (
            <Card title={`Stalled (${stalledDays}+ days quiet)`}>
              <ul className="space-y-1.5 text-sm">
                {stalled.map(({ m, last }) => (
                  <li key={m.id}>
                    <Link href={`/matters/${m.id}`} className="font-semibold text-navy-800 hover:underline">
                      {m.code}
                    </Link>{" "}
                    <span className="text-slate-500">
                      stage {m.stage}, last change {formatDate(last)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function SweepMeter({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  const tone: Tone = done === total ? "green" : "amber";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-700">
          {done} of {total} pending cases checked this week
        </span>
        <Badge tone={tone}>{pct}%</Badge>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${done === total ? "bg-emerald-500" : "bg-gold-400"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500">USCIS receipts and EOIR matters, checked online once a week.</p>
    </div>
  );
}
