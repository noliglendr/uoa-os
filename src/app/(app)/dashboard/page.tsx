import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Loading, NotForYourRole, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { today } from "@/lib/deadlines";
import { DECISIONS, MATTER_TYPES, formatMoney, label, stageName } from "@/lib/labels";
import {
  approvalWait, deadlineRecord, decisionCounts, lastMonths, mattersByMonth, outboxRecord, receiptRecord, revenue,
  stageDurations, stageEntries, windowStart,
} from "@/lib/kpis";

export const metadata: Metadata = { title: "Firm dashboard" };

// Firm dashboard (Phase 1 brief, capability 7; decision #30): revenue and KPIs
// for the principal. "Where am I needed" stays on My work. Numbers only, no
// client data. Earned fees only: trust (IOLTA) money is never shown here.
export default function FirmDashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Firm · Last 12 months"
        icon="chart"
        title="Firm dashboard"
        description="How the firm is doing: fees billed, deadlines met, receipts logged on time, and how long matters and approvals take. Today's work is on My work."
      />
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

async function Dashboard() {
  const { supabase, staff } = await requireStaff();
  if (!staff || !["principal", "attorney", "administrator"].includes(staff.role)) {
    return <NotForYourRole who="the attorney, the principal and administrators" />;
  }

  const now = today();
  const months = lastMonths(now, 12);
  const since = windowStart(months);
  // Every row, in pages: Supabase returns at most 1,000 rows per request.
  type Query = { range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }> };
  const all = async (query: () => Query): Promise<Row[]> => {
    const rows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await query().range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if ((data ?? []).length < 1000) return rows;
    }
  };
  // Optional tables (a later migration not applied yet) read as empty.
  const optional = (query: () => Query) => all(query).catch(() => [] as Row[]);
  const [allMatters, events, deadlines, filings, gates, messages, invoices, setting, receipts] = await Promise.all([
    all(() => supabase.from("matters").select("id, created_at, status, matter_type").order("id")),
    all(() =>
      supabase
        .from("event_log")
        .select("matter_id, occurred_at, event_type, payload")
        .in("event_type", ["matter.stage_changed", "matter.closed"])
        .order("id"),
    ),
    all(() => supabase.from("deadlines").select("kind, status, due_date, completed_at, voided_at").order("id")),
    all(() => supabase.from("filings").select("filed_at, receipt_logged_at, decision, voided_at").order("id")),
    all(() => supabase.from("gates").select("matter_id, stage, cycle_id, approved_at").order("id")),
    optional(() => supabase.from("client_messages").select("status, created_at, sent_at").order("id")),
    optional(() => supabase.from("invoices").select("status, amount_cents, approved_at, sent_at, matter:matters(matter_type)").order("id")),
    supabase.from("settings").select("value").eq("key", "followup.receipt_business_days").maybeSingle(),
    all(() => supabase.from("notices").select("received_on, logged_at, voided_at").eq("notice_type", "receipt").order("id")),
  ]);

  const stageEvents = events
    .filter((e) => e.event_type === "matter.stage_changed")
    .map((e) => ({ matter_id: e.matter_id, occurred_at: e.occurred_at, from: Number(e.payload.from), to: Number(e.payload.to) }));
  const closed = events.filter((e) => e.event_type === "matter.closed");
  const receiptDays = Number(setting.data?.value ?? 15);

  const opened = mattersByMonth(allMatters, closed, months);
  const stages = stageDurations(allMatters, stageEvents);
  const dl = deadlineRecord(deadlines, now, since);
  const rc = receiptRecord(receipts, filings, now, since, receiptDays);
  const approvals = approvalWait(gates, stageEntries(allMatters, stageEvents));
  const outbox = outboxRecord(messages);
  const decisions = decisionCounts(filings);
  const money = revenue(invoices.map((i) => ({ ...i, matter_type: i.matter?.matter_type })), months);
  const open = allMatters.filter((m) => m.status === "prospect" || m.status === "active");
  const thisMonth = money.byMonth[money.byMonth.length - 1].cents;
  const pct = (n: number | null) => (n === null ? "–" : `${n}%`);
  const dayText = (n: number | null) => (n === null ? "–" : `${n < 10 ? n.toFixed(1) : Math.round(n)} days`);
  const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open matters" value={open.length} hint={`${allMatters.length} in total`} />
        <Stat label="Deadlines met on time" value={pct(dl.rate)} tone={dl.rate === null ? "gray" : dl.rate === 100 ? "green" : "red"} hint={`${dl.onTime} of ${dl.counted} response deadlines`} />
        <Stat label="Receipts on time" value={pct(rc.rate)} tone={rc.rate === null ? "gray" : rc.rate >= 90 ? "green" : "amber"} hint="Logged within 1 business day of arriving" />
        <Stat label="Billed this month" value={formatMoney(thisMonth)} hint={`${formatMoney(money.totalBilled)} in 12 months`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Fees billed per month" description="Invoices the attorney approved, by approval month. Payments collected are in the billing tool.">
          <BarList rows={money.byMonth.map((r) => ({ label: monthName(r.month), value: r.cents, text: formatMoney(r.cents) }))} />
          <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
            <li>
              Drafts waiting for the attorney: <strong className="text-slate-900">{money.drafts}</strong>
              {money.draftsWithoutAmount > 0 && <> ({money.draftsWithoutAmount} with no amount yet)</>}
            </li>
            <li>
              Approved, not yet in the billing tool: <strong className="text-slate-900">{formatMoney(money.approvedNotEntered)}</strong>
            </li>
          </ul>
        </Card>

        <Card title="Fees billed by matter type" description="Last 12 months and earlier, approved invoices only.">
          <BarList rows={Object.entries(MATTER_TYPES).map(([k, l]) => ({ label: l, value: money.byType[k] ?? 0, text: formatMoney(money.byType[k] ?? 0) }))} />
        </Card>

        <Card title="Deadlines" description="Response deadlines due in the last 12 months (RFE, NOID, appeals, motions).">
          <Figures
            items={[
              { label: "Met on time", value: dl.onTime },
              { label: "Met late or missed", value: dl.late, alert: dl.late > 0 },
              { label: "Overdue now", value: dl.overdue, alert: dl.overdue > 0 },
            ]}
          />
        </Card>

        <Card title="Receipts logged" description={`Receipts that arrived in the last 12 months, logged within 1 business day of arriving. "No receipt yet" counts filings still without one ${receiptDays} business days after filing.`}>
          <Figures
            items={[
              { label: "On time", value: rc.onTime },
              { label: "Late", value: rc.late, alert: rc.late > 0 },
              { label: "No receipt yet", value: rc.waiting, alert: rc.waiting > 0 },
            ]}
          />
        </Card>

        <Card title="Average days in each stage" description="For matters that have left the stage.">
          <BarList
            rows={stages.map((s) => ({
              label: `${s.stage}. ${stageName(s.stage)}`,
              value: s.avgDays ?? 0,
              text: s.avgDays === null ? "–" : `${dayText(s.avgDays)} · ${s.matters}`,
            }))}
          />
          <p className="mt-3 text-xs text-slate-500">The last number is how many matters the average is based on.</p>
        </Card>

        <Card title="Matters opened and closed">
          <Table head={["Month", "Opened", "Closed"]}>
            {opened.map((r) => (
              <tr key={r.month}>
                <Td>{monthName(r.month)}</Td>
                <Td className="tabular-nums">{r.opened}</Td>
                <Td className="tabular-nums">{r.closed}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Attorney approvals" description="Stages 2, 3, 5 and 6: days from reaching the stage to the attorney's approval.">
          <Figures
            items={[
              { label: "Approvals", value: approvals.approvals },
              { label: "Average wait", value: dayText(approvals.avgDays) },
              { label: "Longest wait", value: dayText(approvals.maxDays) },
            ]}
          />
        </Card>

        <Card title="Clients" description="Client outbox messages, and decisions recorded.">
          <Figures
            items={[
              { label: "Messages sent", value: outbox.sent },
              { label: "Sent within a day", value: pct(outbox.withinDayRate) },
              { label: "Waiting now", value: outbox.waiting, alert: outbox.waiting > 0 },
            ]}
          />
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
            Decisions:{" "}
            {Object.keys(decisions).length === 0
              ? "none recorded yet"
              : Object.entries(decisions)
                  .map(([k, n]) => `${label(DECISIONS, k)} ${n}`)
                  .join(" · ")}
          </p>
        </Card>
      </div>

      <p className="text-xs text-slate-500">
        All the data behind these numbers can be downloaded from the Export page. Fees are earned fees from UOA OS invoices; trust (IOLTA) money is not
        shown here.
      </p>
    </>
  );
}

/** Horizontal bars, one hue; the value is written beside each bar and shown on hover. */
function BarList({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.text}`} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded px-1 text-sm hover:bg-slate-50">
          <span className="truncate text-slate-600">{r.label}</span>
          <span className="h-3 rounded-r-[4px] bg-slate-100">
            <span className="block h-full rounded-r-[4px] bg-navy-600" style={{ width: max ? `${(r.value / max) * 100}%` : "0%" }} />
          </span>
          <span className="w-28 text-right tabular-nums text-slate-900">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** A few headline numbers in a row. Alerts carry words and a red value, never color alone. */
function Figures({ items }: { items: { label: string; value: number | string; alert?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-3">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs text-slate-500">{i.label}</dt>
          <dd className={`mt-1 text-2xl font-semibold tabular-nums ${i.alert ? "text-red-700" : "text-slate-900"}`}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
