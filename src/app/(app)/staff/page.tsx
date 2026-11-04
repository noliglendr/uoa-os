import { Suspense } from "react";
import { Badge, Button, Card, ErrorBanner, Hidden, Loading, PageHeader, Table, Td, inputClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, formatDate } from "@/lib/labels";
import { updateStaff } from "./actions";
import { AddStaffForm } from "./add-staff-form";

// Staff and roles (D4). The principal adds people, sets roles and switches access off.
export default function StaffPage({ searchParams }: PageProps<"/staff">) {
  return (
    <>
      <PageHeader title="Staff" description="Who can sign in, and in which role. Nobody is deleted: switching access off keeps their name on everything they did." />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Staff />
      </Suspense>
    </>
  );
}

async function Staff() {
  // One database call, alongside the sign-in check. Emails, two-step status
  // and last sign-in come from Supabase Auth, for the principal only.
  const supabase = await createClient();
  const [{ staff }, { data, error }] = await Promise.all([requireStaff(), supabase.rpc("staff_page")]);
  if (error) throw error;
  const principal = staff?.role === "principal";
  const profiles = data as {
    id: string;
    display_name: string;
    role: keyof typeof ROLE_LABELS;
    active: boolean;
    email?: string;
    mfa?: boolean;
    last_sign_in_at?: string | null;
  }[];
  const auth = new Map(profiles.map((p) => [p.id, { email: p.email ?? "", mfa: Boolean(p.mfa), lastSignIn: p.last_sign_in_at ?? null }]));

  return (
    <>
      <Card title="People and roles">
        <Table head={principal ? ["Name", "Email", "Role", "Two-step sign-in", "Last sign-in", "Access"] : ["Name", "Role"]}>
          {profiles.map((p) => {
            const a = auth.get(p.id);
            const self = p.id === staff?.id;
            return (
              <tr key={p.id}>
                <Td>
                  {p.display_name} {self && <span className="text-xs text-slate-500">(you)</span>}
                </Td>
                {principal && <Td className="text-xs">{a?.email}</Td>}
                <Td>
                  {principal && !self ? (
                    <form action={updateStaff} className="flex gap-1">
                      <Hidden values={{ profile_id: p.id }} />
                      <select name="role" defaultValue={p.role} className={inputClass}>
                        {Object.entries(ROLE_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <Button className="text-xs">Save</Button>
                    </form>
                  ) : (
                    ROLE_LABELS[p.role]
                  )}
                </Td>
                {principal && (
                  <>
                    <Td>{a?.mfa ? <Badge tone="green">Set up</Badge> : <Badge tone="amber">Not yet</Badge>}</Td>
                    <Td className="text-xs">{a?.lastSignIn ? formatDate(a.lastSignIn) : "Never"}</Td>
                    <Td>
                      {p.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Off</Badge>}
                      {!self && (
                        <form action={updateStaff} className="mt-1">
                          <Hidden values={{ profile_id: p.id, active: String(!p.active) }} />
                          <ConfirmButton
                            variant={p.active ? "danger" : "secondary"}
                            confirm={p.active ? `Switch off access for ${p.display_name}? They can no longer sign in.` : `Switch access back on for ${p.display_name}?`}
                          >
                            {p.active ? "Switch off access" : "Switch on access"}
                          </ConfirmButton>
                        </form>
                      )}
                    </Td>
                  </>
                )}
              </tr>
            );
          })}
        </Table>
        <p className="mt-3 text-xs text-slate-500">
          Nobody is deleted: switching access off keeps their name on everything they did. Every change is logged.
        </p>
      </Card>
      {principal && (
        <Card title="Add a staff member">
          <AddStaffForm />
        </Card>
      )}
    </>
  );
}
