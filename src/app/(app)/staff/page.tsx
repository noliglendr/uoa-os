import { Suspense } from "react";
import { Badge, Button, Card, ErrorBanner, Hidden, Loading, PageHeader, Table, Td, inputClass, NotForYourRole } from "@/components/ui";
import { LEGAL_ROLES, canManage, requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, formatDate } from "@/lib/labels";
import { updateStaff } from "./actions";
import { AddStaffForm } from "./add-staff-form";
import { AccessButton } from "./access-button";
import { EditStaff } from "./edit-staff";

// Staff and roles (D4). The principal or an administrator adds people, sets roles
// and switches access off; only the principal handles the Principal and Attorney roles.
export default function StaffPage({ searchParams }: PageProps<"/staff">) {
  return (
    <>
      <PageHeader eyebrow="Firm · Roles and access" icon="users" title="Staff" description="Who can sign in, and in which role. Anyone with history stays in the records: switch off their access. Only unused accounts can be removed." />
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
  // and last sign-in come from Supabase Auth, for the principal and administrators only.
  const supabase = await createClient();
  const [{ staff }, { data, error }] = await Promise.all([requireStaff(), supabase.rpc("staff_page")]);
  if (error) throw error;
  const manager = canManage(staff);
  if (!manager) return <NotForYourRole who="the principal and administrators" />;
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
        <Table head={manager ? ["Name", "Email", "Role", "Two-step sign-in", "Last sign-in", "Access", ""] : ["Name", "Role"]}>
          {profiles.map((p) => {
            const a = auth.get(p.id);
            const self = p.id === staff?.id;
            return (
              <tr key={p.id}>
                <Td>
                  {p.display_name} {self && <span className="text-xs text-slate-500">(you)</span>}
                </Td>
                {manager && <Td className="text-xs">{a?.email}</Td>}
                <Td>
                  {manager && !self && (principal || !LEGAL_ROLES.includes(p.role)) ? (
                    <form action={updateStaff} className="flex gap-1">
                      <Hidden values={{ profile_id: p.id }} />
                      <select name="role" defaultValue={p.role} className={inputClass}>
                        {Object.entries(ROLE_LABELS)
                          .filter(([v]) => principal || !LEGAL_ROLES.includes(v))
                          .map(([v, l]) => (
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
                {manager && (
                  <>
                    <Td>{a?.mfa ? <Badge tone="green">Set up</Badge> : <Badge tone="amber">Not yet</Badge>}</Td>
                    <Td className="text-xs">{a?.lastSignIn ? formatDate(a.lastSignIn) : "Never"}</Td>
                    <Td>
                      {p.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Off</Badge>}
                      {!self && (principal || !LEGAL_ROLES.includes(p.role)) && (
                        <AccessButton id={p.id} name={p.display_name} active={p.active} />
                      )}
                    </Td>
                    <Td>
                      {!self && (principal || !LEGAL_ROLES.includes(p.role)) && (
                        <EditStaff id={p.id} name={p.display_name} email={a?.email} role={ROLE_LABELS[p.role] ?? p.role} />
                      )}
                    </Td>
                  </>
                )}
              </tr>
            );
          })}
        </Table>
        <p className="mt-3 text-xs text-slate-500">
          Switching access off keeps a person&apos;s name on everything they did. Only accounts with no activity can be removed (Edit → Remove). Every change is logged.
        </p>
      </Card>
      {manager && (
        <Card title="Add a staff member">
          <AddStaffForm principal={principal} />
        </Card>
      )}
    </>
  );
}
