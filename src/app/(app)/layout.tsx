import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumb, MobileTabBar, TabList } from "@/components/app-chrome";
import { Icon } from "@/components/icons";
import { MobileMenu, NavList, SidebarNav } from "@/components/sidebar-nav";
import { buttonClass, inputClass } from "@/components/styles";
import { requireStaff } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/labels";
import { signOut } from "../actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const nav = (
    <Suspense fallback={<NavList pathname="" />}>
      <SidebarNav />
    </Suspense>
  );
  const user = (
    <Suspense fallback={null}>
      <UserPanel />
    </Suspense>
  );

  return (
    <div className="flex min-h-full flex-1 flex-col lg:pl-64">
      {/* Desktop: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-900 lg:flex">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">{nav}</div>
        <div className="border-t border-white/10 p-3">{user}</div>
      </aside>

      {/* Top bar: where you are, matter search, new matter */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="hidden min-w-0 flex-1 lg:block">
            <Suspense fallback={null}>
              <Breadcrumb />
            </Suspense>
          </div>
          <div className="flex-1 lg:hidden" />
          <form action="/matters" role="search" className="relative hidden sm:block">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="q" type="search" placeholder="Search matters…" aria-label="Search matters" className={`${inputClass} h-9 w-56 pl-8 lg:w-72`} />
          </form>
          <Link href="/matters" aria-label="Search matters" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 sm:hidden">
            <Icon name="search" className="h-5 w-5" />
          </Link>
          <Link href="/matters/new" className={buttonClass("primary", "hidden h-9 sm:inline-flex")}>
            <Icon name="plus" /> New matter
          </Link>
          <div className="lg:hidden">
            <MobileMenu>
              {nav}
              <div className="mt-4 border-t border-white/10 pt-3">{user}</div>
            </MobileMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-8">{children}</main>

      {/* Bottom bar (desktop): the system's ground rules, always visible */}
      <footer className="hidden border-t border-slate-200 bg-white lg:block">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-8 py-3 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <Icon name="shield" className="h-4 w-4 text-navy-500" />
            The system never files, signs or submits anything. The attorney approves every key step, and every change is logged.
          </span>
          <span className="flex items-center gap-3">
            <span className="rounded-full bg-gold-100 px-2 py-0.5 font-medium text-gold-600">Synthetic data only</span>
            <span>UOA Legal · Firm OS · Increment 1</span>
          </span>
        </div>
      </footer>

      {/* Bottom bar (phone): main sections one tap away */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <Suspense fallback={<TabList pathname="" />}>
          <MobileTabBar />
        </Suspense>
      </nav>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gold-400 text-sm font-bold tracking-tight text-navy-950">UOA</span>
      <span className="leading-tight">
        <span className={`block text-sm font-semibold ${compact ? "text-navy-900" : "text-white"}`}>UOA Legal</span>
        <span className={`block text-xs ${compact ? "text-slate-500" : "text-navy-300"}`}>Firm OS</span>
      </span>
    </Link>
  );
}

async function UserPanel() {
  const { staff } = await requireStaff();
  return (
    <div className="flex items-center gap-2">
      <Link href="/account" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-700 text-xs font-semibold text-white">
          {staff ? initials(staff.displayName) : "?"}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium text-white">{staff?.displayName ?? "No active role"}</span>
          <span className="block text-xs text-navy-300">{staff ? ROLE_LABELS[staff.role] : "Ask the principal"}</span>
        </span>
      </Link>
      <form action={signOut}>
        <button type="submit" title="Sign out" aria-label="Sign out" className="rounded-md p-2 text-navy-300 hover:bg-white/5 hover:text-white">
          <Icon name="logout" className="h-[18px] w-[18px]" />
        </button>
      </form>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
