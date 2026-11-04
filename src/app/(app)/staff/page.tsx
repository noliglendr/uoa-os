import { Suspense } from "react";
import { Badge, Button, Card, ErrorBanner, Hidden, Table, Td, inputClass } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABELS, formatDate } from "@/lib/labels";
import { updateStaff } from "./actions";
import { AddStaffForm } from "./add-staff-form";

// Staff and roles (D4). The principal adds people, sets roles and switches access off.
export default function StaffPage({ searchParams }: PageProps<"/staff">) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Staff</h1>
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Staff />
      </Suspense>
    </>
  );
}

async function Staff() {
  const { supabase, staff } = await requireStaff();
  const principal = staff?.role === "principal";
  const { data: profiles } = await supabase.from("profiles").select("*").order("created_at");

  // Emails and MFA status live in Supabase Auth; only the principal sees them.
  const auth = new Map<string, { email: string; mfa: boolean; lastSignIn: string | null }>();
  if (principal) {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    await Promise.all(
      (data?.users ?? []).map(async (u) => {
        const { data: f } = await admin.auth.admin.mfa.listFactors({ userId: u.id });
        auth.set(u.id, {
          email: u.email ?? "",
          mfa: (f?.factors ?? []).some((x) => x.status === "verified"),
          lastSignIn: u.last_sign_in_at ?? null,
        });
      }),
    );
  }

  return (
    <>
      <Card title="People and roles">
        <Table head={principal ? ["Name", "Email", "Role", "Two-step sign-in", "Last sign-in", "Access"] : ["Name", "Role"]}>
          {(profiles ?? []).map((p) => {
            const a = auth.get(p.id);
            const self = p.id === staff?.id;
            return (
              <tr key={p.id}>
                <Td>
                  {p.display_name} {self && <span className="text-xs text-zinc-500">(you)</span>}
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
                          <Button variant={p.active ? "danger" : "secondary"} className="text-xs">
                            {p.active ? "Switch off access" : "Switch on access"}
                          </Button>
                        </form>
                      )}
                    </Td>
                  </>
                )}
              </tr>
            );
          })}
        </Table>
        <p className="mt-3 text-xs text-zinc-500">
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
