import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, ErrorBanner } from "@/components/ui";
import { requireStaff, isAttorney } from "@/lib/session";
import { MATTER_STATUS, MATTER_TYPES, label } from "@/lib/labels";
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

export default function MatterPage({ params, searchParams }: PageProps<"/matters/[id]">) {
  return (
    <>
      <Link href="/matters" className="text-sm text-zinc-500 hover:underline">
        ← All matters
      </Link>
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Matter params={params} />
      </Suspense>
    </>
  );
}

async function Matter({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, staff } = await requireStaff();

  const { data: matter } = await supabase.from("matters").select("*").eq("id", id).maybeSingle();
  if (!matter) notFound();

  const [checks, closure, gates, parties, appearances, filings, cycles, notices, deadlines, checklist, tasks, events, profiles, rules] =
    await Promise.all([
      supabase.rpc("exit_checks", { p_matter: id }),
      supabase.rpc("closure_checks", { p_matter: id }),
      supabase.from("gates").select("*").eq("matter_id", id),
      supabase.from("parties").select("*").eq("matter_id", id).order("created_at"),
      supabase.from("appearances").select("*, successor:matters!appearances_transferred_to_fkey(code)").eq("matter_id", id).order("created_at"),
      supabase.from("filings").select("*").eq("matter_id", id).order("created_at"),
      supabase.from("response_cycles").select("*").eq("matter_id", id).order("created_at"),
      supabase.from("notices").select("*").eq("matter_id", id).order("logged_at", { ascending: false }),
      supabase.from("deadlines").select("*").eq("matter_id", id).order("due_date"),
      supabase.from("checklist_items").select("*").eq("matter_id", id).order("created_at"),
      supabase.from("tasks").select("*").eq("matter_id", id).eq("status", "open").order("due_date"),
      supabase.from("event_log").select("*").eq("matter_id", id).order("occurred_at", { ascending: false }).limit(300),
      supabase.from("profiles").select("id, display_name, role"),
      supabase.from("deadline_rules").select("code, label, kind, days, attorney_verified").order("code"),
    ]);

  const cycleChecks = Object.fromEntries(
    await Promise.all(
      (cycles.data ?? [])
        .filter((c) => c.status === "open")
        .map(async (c) => [c.id, (await supabase.rpc("exit_checks", { p_matter: id, p_cycle: c.id })).data ?? []] as const),
    ),
  );

  const data: MatterData = {
    matter,
    attorney: isAttorney(staff),
    checks: checks.data ?? [],
    closure: closure.data ?? [],
    gates: gates.data ?? [],
    parties: parties.data ?? [],
    appearances: appearances.data ?? [],
    filings: filings.data ?? [],
    cycles: cycles.data ?? [],
    cycleChecks,
    notices: notices.data ?? [],
    deadlines: deadlines.data ?? [],
    checklist: checklist.data ?? [],
    tasks: tasks.data ?? [],
    events: events.data ?? [],
    names: Object.fromEntries((profiles.data ?? []).map((p) => [p.id, p.display_name])),
    rules: rules.data ?? [],
    back: `/matters/${id}`,
  };
  const attorneyName = data.names[matter.attorney_id] ?? "";

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{matter.code}</h1>
        <span className="text-zinc-600 dark:text-zinc-400">{matter.summary}</span>
        <Badge>{label(MATTER_TYPES, matter.matter_type)}</Badge>
        <Badge tone={matter.status === "active" ? "green" : matter.status === "prospect" ? "blue" : "gray"}>
          {label(MATTER_STATUS, matter.status)}
        </Badge>
        {matter.urgent && <Badge tone="red">Urgent</Badge>}
        {matter.hard_deadline && <Badge tone="amber">Hard deadline</Badge>}
        {matter.legal_hold && <Badge tone="red">Legal hold</Badge>}
        <span className="text-sm text-zinc-500">Attorney of record: {attorneyName}</span>
      </div>
      <NextStepCard d={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <DeadlinesCard d={data} />
        <TasksCard d={data} />
      </div>
      <NoticesCard d={data} />
      <FilingsCard d={data} />
      <CyclesCard d={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PartiesCard d={data} />
        <AppearancesCard d={data} />
      </div>
      <ChecklistCard d={data} />
      <HistoryCard d={data} />
    </>
  );
}
