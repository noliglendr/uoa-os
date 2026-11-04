import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Empty, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { daysBetween, describeDue, today } from "@/lib/deadlines";
import { GATE_LABELS, ROLE_LABELS, STAGES, formatDate, stageName } from "@/lib/labels";
import { sweepItems } from "./sweep/items";

// Principal dashboard: where am I needed, what is due, what is stuck.
export default function Dashboard() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

type QueueItem = { matterId: string; code: string; what: string; tone: "red" | "amber" | "blue" };

async function DashboardContent() {
  const { supabase, staff } = await requireStaff();
  if (!staff) {
    return (
      <p role="alert" className="text-red-600">
        Your account has no active role. Ask the principal to set up your access.
      </p>
    );
  }

  const [matters, gates, cycles, deadlines, drafts, filings, events, settings, tasks] = await Promise.all([
    supabase.from("matters").select("id, code, summary, stage, status, urgent, engagement_alert_date, stage_changed_at"),
    supabase.from("gates").select("matter_id, cycle_id, stage"),
    supabase.from("response_cycles").select("id, matter_id, stage, kind").eq("status", "open"),
    supabase
      .from("deadlines")
      .select("id, matter_id, title, kind, due_date, raw_due_date, attorney_verified, rule_code")
      .eq("status", "open")
      .order("due_date"),
    supabase.from("checklist_items").select("matter_id, label").eq("third_party_draft", true).in("status", ["drafted", "attorney_review"]),
    supabase.from("filings").select("matter_id, form_type, decision, client_informed_at").not("decision", "is", null).is("client_informed_at", null),
    supabase.from("event_log").select("matter_id, occurred_at").not("matter_id", "is", null).order("occurred_at", { ascending: false }).limit(5000),
    supabase.from("settings").select("key, value").eq("key", "dashboard.stalled_days"),
    supabase.from("tasks").select("id, matter_id, title, owner_role, due_date").eq("status", "open").order("due_date"),
  ]);

  const sweep = await sweepItems(supabase);
  const now = today();
  const all = matters.data ?? [];
  const open = all.filter((m) => m.status === "prospect" || m.status === "active");
  const byId = new Map(all.map((m) => [m.id, m]));
  const code = (id: string) => byId.get(id)?.code ?? "?";
  const hasGate = (matterId: string, stage: number, cycleId: string | null = null) =>
    (gates.data ?? []).some((g) => g.matter_id === matterId && g.stage === stage && g.cycle_id === cycleId);

  // Sign-off queue: everything waiting on the attorney.
  const queue: QueueItem[] = [];
  for (const m of open) {
    if ([2, 3, 5, 6].includes(m.stage) && !hasGate(m.id, m.stage)) {
      queue.push({ matterId: m.id, code: m.code, what: GATE_LABELS[m.stage], tone: "amber" });
    }
    if (m.stage <= 2 && m.engagement_alert_date && m.engagement_alert_date <= now && !hasGate(m.id, 2)) {
      queue.push({ matterId: m.id, code: m.code, what: `Engagement not signed by the alert date (${formatDate(m.engagement_alert_date)})`, tone: "red" });
    }
  }
  for (const c of cycles.data ?? []) {
    if ((c.stage === 5 || c.stage === 6) && !hasGate(c.matter_id, c.stage, c.id)) {
      queue.push({ matterId: c.matter_id, code: code(c.matter_id), what: `${c.kind.toUpperCase()} response: ${GATE_LABELS[c.stage]}`, tone: "amber" });
    }
  }
  for (const d of deadlines.data ?? []) {
    if (d.kind === "review") queue.push({ matterId: d.matter_id, code: code(d.matter_id), what: d.title, tone: "red" });
    else if (!d.attorney_verified) {
      queue.push({ matterId: d.matter_id, code: code(d.matter_id), what: `Verify deadline: ${d.title} (${formatDate(d.due_date)})`, tone: "amber" });
    }
  }
  for (const i of drafts.data ?? []) {
    queue.push({ matterId: i.matter_id, code: code(i.matter_id), what: `Review third-party draft: ${i.label}`, tone: "blue" });
  }
  for (const f of filings.data ?? []) {
    queue.push({ matterId: f.matter_id, code: code(f.matter_id), what: `Tell the client: ${f.form_type} ${f.decision}`, tone: "red" });
  }

  const upcoming = (deadlines.data ?? []).filter((d) => daysBetween(now, d.due_date) <= 30);

  const stalledDays = Number(settings.data?.[0]?.value ?? 14);
  const lastEvent = new Map<string, string>();
  for (const e of events.data ?? []) if (!lastEvent.has(e.matter_id)) lastEvent.set(e.matter_id, e.occurred_at);
  const stalled = open
    .map((m) => ({ m, last: lastEvent.get(m.id) ?? m.stage_changed_at }))
    .filter(({ last }) => daysBetween(last.slice(0, 10), now) >= stalledDays);

  const myTasks = (tasks.data ?? []).filter(
    (t) => t.owner_role === staff.role || (staff.role === "principal" && t.owner_role === "attorney"),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<>Sign-off queue <Badge tone={queue.length ? "amber" : "green"}>{queue.length}</Badge></>}>
        {queue.length === 0 ? (
          <Empty>Nothing is waiting for the attorney.</Empty>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {queue.map((q, i) => (
              <li key={i} className="flex gap-2">
                <Badge tone={q.tone}>{q.code}</Badge>
                <Link href={`/matters/${q.matterId}`} className="hover:underline">
                  {q.what}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Deadlines in the next 30 days">
        {upcoming.length === 0 ? (
          <Empty>No open deadlines in the next 30 days.</Empty>
        ) : (
          <Table head={["Due", "", "Matter", "Deadline", "Verified"]}>
            {upcoming.map((d) => {
              const left = daysBetween(now, d.due_date);
              return (
                <tr key={d.id}>
                  <Td className="whitespace-nowrap">{formatDate(d.due_date)}</Td>
                  <Td className="whitespace-nowrap">
                    <Badge tone={left < 0 ? "red" : left <= 7 ? "amber" : "gray"}>{describeDue(d.due_date, now)}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/matters/${d.matter_id}`} className="font-medium hover:underline">
                      {code(d.matter_id)}
                    </Link>
                  </Td>
                  <Td>{d.title}</Td>
                  <Td>{d.attorney_verified ? <Badge tone="green">Yes</Badge> : <Badge tone="amber">No</Badge>}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="Open matters by stage" actions={<Link href="/matters" className="text-sm underline">All matters</Link>}>
        <ul className="space-y-1 text-sm">
          {STAGES.slice(0, 10).map((s) => {
            const here = open.filter((m) => m.stage === s.n);
            return (
              <li key={s.n} className="flex items-baseline gap-2">
                <span className="w-6 text-right text-zinc-500">{s.n}</span>
                <span className="w-48">{s.name}</span>
                <span className="flex flex-wrap gap-1">
                  {here.map((m) => (
                    <Link key={m.id} href={`/matters/${m.id}`}>
                      <Badge tone={m.urgent ? "red" : "blue"}>{m.code}</Badge>
                    </Link>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={`Stalled matters (nothing logged for ${stalledDays}+ days)`}>
        {stalled.length === 0 ? (
          <Empty>No stalled matters.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {stalled.map(({ m, last }) => (
              <li key={m.id}>
                <Link href={`/matters/${m.id}`} className="font-medium hover:underline">
                  {m.code}
                </Link>{" "}
                stage {m.stage} ({stageName(m.stage)}), last change {formatDate(last)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Weekly status sweep" actions={<Link href="/sweep" className="text-sm underline">Open sweep</Link>}>
        <p className="text-sm">
          {sweep.due.length === 0 ? (
            <>All {sweep.items.length} pending cases were checked in the last 7 days.</>
          ) : (
            <>
              <Badge tone="amber">{sweep.due.length}</Badge> of {sweep.items.length} pending cases need this week&apos;s
              online check (USCIS and EOIR).
            </>
          )}
        </p>
      </Card>

      <Card title={`Open tasks for ${ROLE_LABELS[staff.role]}`}>
        {myTasks.length === 0 ? (
          <Empty>No open tasks.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {myTasks.map((t) => (
              <li key={t.id} className="flex gap-2">
                <span className="w-24 shrink-0 text-zinc-500">{t.due_date ? formatDate(t.due_date) : ""}</span>
                <Link href={`/matters/${t.matter_id}`} className="hover:underline">
                  <strong>{code(t.matter_id)}</strong> {t.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
