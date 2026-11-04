import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumb, MobileTabBar, SearchBox, TabList } from "@/components/app-chrome";
import { Icon } from "@/components/icons";
import { MobileMenu, NavList, SidebarNav } from "@/components/sidebar-nav";
import { buttonClass } from "@/components/styles";
import { UserMenu } from "@/components/user-menu";
import { requireStaff } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/labels";
import { signOut } from "../actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const nav = (
    <Suspense fallback={<NavList pathname="" />}>
      <RoleNav />
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

      {/* Top bar: where you are, matter search, quick actions, you */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 shadow-[0_1px_0_0_rgb(15_23_42/0.02),0_8px_24px_-12px_rgb(15_23_42/0.08)] backdrop-blur-xl">
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
          <div className="hidden md:block">
            <SearchBox />
          </div>
          <Link href="/matters" aria-label="Search matters" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden">
            <Icon name="search" className="h-5 w-5" />
          </Link>
          <Link href="/" title="What needs you" aria-label="What needs you" className="relative hidden rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-navy-900 sm:block">
            <Icon name="bell" className="h-5 w-5" />
          </Link>
          <Link href="/matters/new" className={buttonClass("primary", "hidden h-10 rounded-lg px-4 sm:inline-flex")}>
            <Icon name="plus" /> New matter
          </Link>
          <span className="hidden h-8 w-px bg-slate-200 lg:block" aria-hidden />
          <Suspense fallback={<span className="hidden h-9 w-9 rounded-full bg-slate-100 lg:block" />}>
            <TopAvatar />
          </Suspense>
          <div className="lg:hidden">
            <MobileMenu>
              {nav}
              <div className="mt-4 border-t border-white/10 pt-3">{user}</div>
            </MobileMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-10">{children}</main>

      {/* Bottom bar (desktop): system status and the ground rules, always visible */}
      <footer className="hidden border-t border-slate-200 bg-white lg:block">
        <div className="h-0.5 bg-gradient-to-r from-navy-800 via-gold-400 to-navy-800 opacity-80" aria-hidden />
        <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-6 px-8 py-4 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 font-medium text-slate-700">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              System online
            </span>
            <span className="h-4 w-px bg-slate-200" aria-hidden />
            <span className="flex items-center gap-1.5">
              <Icon name="check" className="h-3.5 w-3.5 text-emerald-600" /> Every change logged
            </span>
          </div>
          <p className="flex items-center justify-center gap-2 text-center">
            <Icon name="shield" className="h-4 w-4 shrink-0 text-navy-500" />
            The system never files, signs or submits anything. The attorney approves every key step.
          </p>
          <div className="flex items-center gap-4">
            <span className="rounded-full bg-gold-100 px-2.5 py-1 font-semibold text-gold-600 ring-1 ring-inset ring-gold-300">Synthetic data only</span>
            <Link href="/sweep" className="hover:text-navy-800">
              Weekly sweep
            </Link>
            <Link href="/rules" className="hover:text-navy-800">
              Deadline rules
            </Link>
            <span className="text-slate-400">© 2026 UOA Legal · Firm OS v0.1</span>
          </div>
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

/** The menu, showing only the pages your role can use. */
async function RoleNav() {
  const { staff } = await requireStaff();
  return <SidebarNav role={staff?.role} />;
}

/** Your avatar in the top bar (desktop): opens the Account / Sign out menu. */
async function TopAvatar() {
  const { staff, email } = await requireStaff();
  return (
    <UserMenu
      name={staff?.displayName ?? "No active role"}
      role={staff ? ROLE_LABELS[staff.role] : "Ask the principal"}
      email={email}
      initials={staff ? initials(staff.displayName) : "?"}
    />
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
