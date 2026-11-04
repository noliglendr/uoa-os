import { Suspense } from "react";
import { Badge, Button, Card, ErrorBanner, Hidden, Loading, PageHeader, Table, Td, inputClass } from "@/components/ui";
import { isAttorney, requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

import { formatDateTime } from "@/lib/labels";
import { updateRuleNote, verifyRule } from "../actions";

// D7: the attorney verifies each deadline rule here. Unverified rules warn on every deadline.
export default function RulesPage({ searchParams }: PageProps<"/rules">) {
  return (
    <>
      <PageHeader
        title="Deadline rules"
        description="The system computes deadlines from these rules. Nothing is relied on until the attorney verifies it. The date on a notice always wins over the rule, and changing a window resets its verification."
      />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Rules />
      </Suspense>
    </>
  );
}

async function Rules() {
  // One database call, alongside the sign-in check.
  const supabase = await createClient();
  const [{ staff }, { data, error }] = await Promise.all([requireStaff(), supabase.rpc("rules_page")]);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rules = data.rules as any[];
  const names = data.names as Record<string, string>;
  const attorney = isAttorney(staff);
  const verified = rules?.filter((r) => r.attorney_verified).length ?? 0;

  return (
    <Card title={<>Rules <Badge tone={verified === rules?.length ? "green" : "amber"}>{verified} of {rules?.length ?? 0} verified</Badge></>}>
      <Table head={["#", "Forum", "Event", "Window", "Starts from", "Mail +3", "Source", "Notes", "Status"]}>
        {(rules ?? []).map((r) => (
          <tr key={r.code}>
            <Td className="font-mono">{r.code}</Td>
            <Td>{r.forum}</Td>
            <Td>
              {r.label}
              {r.kind === "appointment" && <div className="text-xs text-slate-500">Appointment, prep {r.prep_days} days before</div>}
            </Td>
            <Td>{r.days ? `${r.days} days` : "Date on the notice"}</Td>
            <Td className="text-xs">{r.starts_from}</Td>
            <Td>{r.mailing_extension ? "Yes" : "No"}</Td>
            <Td className="text-xs">{r.source}</Td>
            <Td className="text-xs">
              <form action={updateRuleNote} className="flex gap-1">
                <Hidden values={{ back: "/rules", code: r.code }} />
                <input name="note" defaultValue={r.note ?? ""} className={`${inputClass} w-48 text-xs`} />
                <Button className="text-xs">Save</Button>
              </form>
            </Td>
            <Td>
              {r.attorney_verified ? (
                <>
                  <Badge tone="green">Verified</Badge>
                  <div className="text-xs text-slate-500">
                    {names[r.verified_by]} {formatDateTime(r.verified_at)}
                  </div>
                </>
              ) : (
                <Badge tone="amber">Not verified</Badge>
              )}
              {attorney && (
                <form action={verifyRule} className="mt-1">
                  <Hidden values={{ back: "/rules", code: r.code, value: String(!r.attorney_verified) }} />
                  <Button className="text-xs">{r.attorney_verified ? "Unverify" : "Verify"}</Button>
                </form>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
