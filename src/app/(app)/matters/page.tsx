import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Empty, Loading, PageHeader, Table, Td } from "@/components/ui";
import { LinkPending } from "@/components/link-pending";
import { inputClass } from "@/components/styles";
import { requireStaff } from "@/lib/session";
import { daysBetween, describeDue, today } from "@/lib/deadlines";
import { MATTER_STATUS, MATTER_TYPES, formatDate, label, stageName } from "@/lib/labels";

export default function MattersPage({ searchParams }: PageProps<"/matters">) {
  return (
    <>
      <PageHeader title="Matters" description="Every matter, from intake to closed file." />
      <Suspense fallback={<Loading />}>
        <MatterList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MatterList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = String((await searchParams).q ?? "").trim();
  const { supabase } = await requireStaff();
  const [{ data: matters }, { data: deadlines }] = await Promise.all([
    supabase.from("matters").select("id, code, summary, matter_type, status, stage, urgent").order("code"),
    supabase.from("deadlines").select("matter_id, title, due_date").eq("status", "open").order("due_date"),
  ]);
  const now = today();
  // Search by matter code, summary or type (few matters, so it runs here).
  const needle = q.toLowerCase();
  const shown = (matters ?? []).filter(
    (m) => !needle || [m.code, m.summary, label(MATTER_TYPES, m.matter_type)].some((v) => String(v ?? "").toLowerCase().includes(needle)),
  );

  return (
    <Card
      title={q ? `${shown.length} of ${matters?.length ?? 0} matters match “${q}”` : `${matters?.length ?? 0} matters`}
      actions={
        <form action="/matters" role="search" className="flex gap-2">
          <input name="q" type="search" defaultValue={q} placeholder="Code, summary or type" aria-label="Search matters" className={`${inputClass} w-56`} />
          {q && (
            <Link href="/matters" className="self-center text-xs font-medium text-navy-700 hover:underline">
              Clear
            </Link>
          )}
        </form>
      }
    >
      {!shown.length ? (
        <Empty>{q ? "No matter matches that search." : "No matters yet."}</Empty>
      ) : (
        <Table head={["Matter", "Type", "Status", "Stage", "Next deadline"]}>
          {shown.map((m) => {
            const next = deadlines?.find((d) => d.matter_id === m.id);
            const soon = next ? daysBetween(now, next.due_date) <= 7 : false;
            return (
              <tr key={m.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/matters/${m.id}`} className="inline-flex items-center gap-1.5 font-semibold text-navy-800 hover:underline">
                    {m.code} <LinkPending className="h-3 w-3" />
                  </Link>{" "}
                  {m.urgent && <Badge tone="red">Urgent</Badge>}
                  <div className="text-xs text-slate-500">{m.summary}</div>
                </Td>
                <Td>{label(MATTER_TYPES, m.matter_type)}</Td>
                <Td>
                  <Badge tone={m.status === "active" ? "green" : m.status === "prospect" ? "blue" : "gray"}>{label(MATTER_STATUS, m.status)}</Badge>
                </Td>
                <Td className="min-w-44">
                  <div className="text-sm">
                    {m.stage}. {stageName(m.stage)}
                  </div>
                  <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-navy-700" style={{ width: `${(m.stage / 11) * 100}%` }} />
                  </div>
                </Td>
                <Td>
                  {next ? (
                    <>
                      <span className={soon ? "text-red-700" : ""}>{formatDate(next.due_date)}</span>{" "}
                      <span className="text-xs text-slate-500">({describeDue(next.due_date, now)})</span>
                      <div className="text-xs text-slate-500">{next.title}</div>
                    </>
                  ) : (
                    <span className="text-slate-400">None</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );
}
