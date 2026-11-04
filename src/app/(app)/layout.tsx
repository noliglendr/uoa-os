import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/labels";
import { signOut } from "../actions";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/matters", label: "Matters" },
  { href: "/matters/new", label: "New matter" },
  { href: "/sweep", label: "Weekly sweep" },
  { href: "/rules", label: "Deadline rules" },
  { href: "/staff", label: "Staff" },
  { href: "/settings", label: "Settings" },
  { href: "/export", label: "Export" },
];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            UOA OS
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto text-sm">
            <Suspense fallback={null}>
              <UserBadge />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-xs text-zinc-500">
        Synthetic data only. The system never files, signs or submits anything: the attorney approves every key step.
      </footer>
    </div>
  );
}

async function UserBadge() {
  const { staff } = await requireStaff();
  return (
    <form action={signOut} className="flex items-center gap-3">
      <Link href="/account" className="text-zinc-600 hover:underline dark:text-zinc-400">
        {staff ? (
          <>
            {staff.displayName} ({ROLE_LABELS[staff.role]})
          </>
        ) : (
          <span className="text-red-600">No active role</span>
        )}
      </Link>
      <button type="submit" className="text-zinc-500 underline">
        Sign out
      </button>
    </form>
  );
}
