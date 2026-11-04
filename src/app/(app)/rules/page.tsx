import { Suspense } from "react";
import { Badge, Button, Card, ErrorBanner, Hidden, Table, Td, inputClass } from "@/components/ui";
import { isAttorney, requireStaff } from "@/lib/session";
import { formatDateTime } from "@/lib/labels";
import { updateRuleNote, verifyRule } from "../actions";

// D7: the attorney verifies each deadline rule here. Unverified rules warn on every deadline.
export default function RulesPage({ searchParams }: PageProps<"/rules">) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Deadline rules</h1>
      <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        The system computes deadlines from these rules. Nothing is relied on until the attorney verifies it. The date on a
        notice always wins over the rule. Changing a window resets its verification. Draft and sources:{" "}
        <code>docs/deadline-rules.md</code>.
      </p>
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Rules />
      </Suspense>
    </>
  );
}

async function Rules() {
  const { supabase, staff } = await requireStaff();
  const [{ data: rules }, { data: profiles }] = await Promise.all([
    supabase.from("deadline_rules").select("*").order("code"),
    supabase.from("profiles").select("id, display_name"),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]));
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
              {r.kind === "appointment" && <div className="text-xs text-zinc-500">Appointment, prep {r.prep_days} days before</div>}
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
                  <div className="text-xs text-zinc-500">
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
