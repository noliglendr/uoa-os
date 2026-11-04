import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Empty, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { describeDue, today } from "@/lib/deadlines";
import { MATTER_STATUS, MATTER_TYPES, formatDate, label, stageName } from "@/lib/labels";

export default function MattersPage() {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Matters</h1>
        <Link href="/matters/new" className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          New matter
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <MatterList />
      </Suspense>
    </>
  );
}

async function MatterList() {
  const { supabase } = await requireStaff();
  const [{ data: matters }, { data: deadlines }] = await Promise.all([
    supabase.from("matters").select("id, code, summary, matter_type, status, stage, urgent").order("code"),
    supabase.from("deadlines").select("matter_id, title, due_date").eq("status", "open").order("due_date"),
  ]);
  const now = today();

  return (
    <Card title={`${matters?.length ?? 0} matters`}>
      {!matters?.length ? (
        <Empty>No matters yet.</Empty>
      ) : (
        <Table head={["Matter", "Type", "Status", "Stage", "Next deadline"]}>
          {matters.map((m) => {
            const next = deadlines?.find((d) => d.matter_id === m.id);
            return (
              <tr key={m.id}>
                <Td>
                  <Link href={`/matters/${m.id}`} className="font-medium hover:underline">
                    {m.code}
                  </Link>{" "}
                  {m.urgent && <Badge tone="red">Urgent</Badge>}
                  <div className="text-xs text-zinc-500">{m.summary}</div>
                </Td>
                <Td>{label(MATTER_TYPES, m.matter_type)}</Td>
                <Td>{label(MATTER_STATUS, m.status)}</Td>
                <Td>
                  {m.stage}. {stageName(m.stage)}
                </Td>
                <Td>
                  {next ? (
                    <>
                      {formatDate(next.due_date)} <span className="text-xs text-zinc-500">({describeDue(next.due_date, now)})</span>
                      <div className="text-xs text-zinc-500">{next.title}</div>
                    </>
                  ) : (
                    ""
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
