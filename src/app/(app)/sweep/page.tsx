import Link from "next/link";
import { Suspense } from "react";
import { Badge, Button, Card, Empty, ErrorBanner, Hidden, Loading, PageHeader, Table, Td, inputClass } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

import { formatDate, stageName } from "@/lib/labels";
import { recordSweepCheck } from "../actions";
import { buildSweep, type SweepData } from "./items";

// Weekly status sweep (redline 9): check every pending USCIS case online and
// every EOIR or federal matter on the court's case information, once a week.
// A change found here is then logged as a notice on the matter.
export default function SweepPage({ searchParams }: PageProps<"/sweep">) {
  return (
    <>
      <PageHeader
        title="Weekly status sweep"
        description="Once a week, check each case online (USCIS case status, EOIR case information, court docket) and record the result. If something changed, log it as a notice on the matter so it gets a deadline."
      />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Sweep />
      </Suspense>
    </>
  );
}

async function Sweep() {
  // One database call, alongside the sign-in check.
  const supabase = await createClient();
  const [, { data, error }] = await Promise.all([requireStaff(), supabase.rpc("sweep_data")]);
  if (error) throw error;
  const { items, last, due } = buildSweep(data as SweepData);
  const names = data.names as Record<string, string>;
  const dueKeys = new Set(due.map((i) => i.key));

  return (
    <Card title={<>Items <Badge tone={due.length ? "amber" : "green"}>{due.length} due this week</Badge></>}>
      {items.length === 0 ? (
        <Empty>Nothing pending with an agency or court.</Empty>
      ) : (
        <Table head={["Matter", "Check", "Where", "Stage", "Last checked", "Record this week's check"]}>
          {items.map((i) => {
            const l = last.get(i.entityId);
            return (
              <tr key={i.key}>
                <Td>
                  <Link href={`/matters/${i.matterId}`} className="font-medium hover:underline">
                    {i.code}
                  </Link>
                </Td>
                <Td>{i.what}</Td>
                <Td>{i.where}</Td>
                <Td>
                  {i.stage}. {stageName(i.stage)}
                </Td>
                <Td className="text-xs">
                  {l ? (
                    <>
                      {formatDate(l.at)} · {names[l.actor] ?? "?"}
                      <div className={l.result === "changed" ? "text-red-600" : "text-slate-500"}>
                        {l.result === "changed" ? "Change found" : "No change"}
                        {l.note && `: ${l.note}`}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-500">Never</span>
                  )}
                  {dueKeys.has(i.key) && <div><Badge tone="amber">Due</Badge></div>}
                </Td>
                <Td>
                  <form action={recordSweepCheck} className="flex flex-wrap items-center gap-1">
                    <Hidden values={{ back: "/sweep", entity_type: i.entityType, entity_id: i.entityId, matter_id: i.matterId }} />
                    <select name="result" className={inputClass}>
                      <option value="no_change">No change</option>
                      <option value="changed">Change found</option>
                    </select>
                    <input name="note" placeholder="Note (no client facts)" className={`${inputClass} w-40`} />
                    <Button>Record</Button>
                  </form>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Change found? Open the matter and log the notice (Notices → Log a notice), so it gets a deadline and is routed.
      </p>
    </Card>
  );
}
