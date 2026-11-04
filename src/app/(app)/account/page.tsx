import { Suspense, type ReactNode } from "react";
import { Badge, Card, Loading, PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { requireStaff } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/labels";
import { signOut } from "../../actions";
import { PasswordForm } from "./password-form";

// Your own account: who you are, your password, and sign-in safety.
export default function AccountPage() {
  return (
    <>
      <PageHeader eyebrow="You · Account" icon="user" title="Your account" description="Your profile, your password and how your sign-in is protected." />
      <Suspense fallback={<Loading rows={3} />}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const { staff, email } = await requireStaff();
  const name = staff?.displayName ?? "No active role";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-5">
        {/* Profile */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="hero relative h-20" aria-hidden>
            <div className="hero-grid absolute inset-0" />
          </div>
          {/* relative z-10: the avatar sits on top of the cover strip, not behind it */}
          <div className="relative z-10 -mt-10 px-5 pb-5">
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-navy-800 text-2xl font-semibold text-white shadow-lg ring-4 ring-white">
              {initials}
            </span>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">{name}</h2>
            <div className="mt-1">{staff ? <Badge tone="blue">{ROLE_LABELS[staff.role]}</Badge> : <Badge tone="red">No active role</Badge>}</div>
            <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
              <Fact icon="mail" label="Email">
                {email ?? "—"}
              </Fact>
              <Fact icon="shield" label="Two-step sign-in">
                <span className="text-emerald-700">On, verified this session</span>
              </Fact>
              <Fact icon="users" label="Role set by">
                The principal (Staff page)
              </Fact>
            </dl>
          </div>
        </section>

        {/* Sign out */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Sign out</h2>
          <p className="mt-1 text-sm text-slate-500">Always sign out on a shared or public computer.</p>
          <form action={signOut} className="mt-3">
            <button type="submit" className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white text-sm font-medium text-red-700 transition hover:bg-red-50">
              <Icon name="logout" className="h-4 w-4" /> Sign out
            </button>
          </form>
        </section>
      </div>

      <div className="grid content-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card title="Change password" description="New staff: replace your temporary password here.">
          <div className="max-w-md">
            <PasswordForm />
          </div>
        </Card>

        <section className="h-fit rounded-xl border border-navy-100 bg-navy-50/60 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-900">
            <Icon name="shield" className="h-4 w-4 text-navy-600" /> Keeping your account safe
          </h2>
          <ul className="mt-3 space-y-3 text-sm text-slate-700">
            <Tip>Use a password you don&apos;t use anywhere else. A password manager helps.</Tip>
            <Tip>Never share your 6-digit code. The firm will never ask for it.</Tip>
            <Tip>New phone? Ask the principal or an administrator to reset your two-step sign-in, then scan the new QR code.</Tip>
            <Tip>Every change you make is logged with your name and the time.</Tip>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Fact({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="truncate text-slate-900">{children}</dd>
      </div>
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-navy-100 text-navy-700">
        <Icon name="check" className="h-3 w-3" />
      </span>
      {children}
    </li>
  );
}
