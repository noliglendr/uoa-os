"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { LinkPending } from "./link-pending";

// Parts of the top and bottom bars that depend on the current page.

const TITLES: [RegExp, string, string][] = [
  [/^\/$/, "Work", "My work"],
  [/^\/matters\/new$/, "Work", "New matter"],
  [/^\/matters\/[^/]+$/, "Matters", "Matter details"],
  [/^\/matters$/, "Work", "Matters"],
  [/^\/sweep/, "Work", "Weekly sweep"],
  [/^\/rules/, "Firm", "Deadline rules"],
  [/^\/staff/, "Firm", "Staff"],
  [/^\/settings/, "Firm", "Settings"],
  [/^\/export/, "Firm", "Export"],
  [/^\/account/, "You", "Account"],
];

/** "Work › My work" in the top bar. */
export function Breadcrumb() {
  const pathname = usePathname();
  const [, section, page] = TITLES.find(([re]) => re.test(pathname)) ?? [null, "", ""];
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      {section === "Matters" ? (
        <Link href="/matters" className="text-slate-500 hover:text-slate-900">
          Matters
        </Link>
      ) : (
        <span className="text-slate-500">{section}</span>
      )}
      <span className="text-slate-300">/</span>
      <span className="truncate font-medium text-slate-900">{page}</span>
    </div>
  );
}

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "My work", icon: "home" },
  { href: "/matters", label: "Matters", icon: "briefcase" },
  { href: "/matters/new", label: "New", icon: "plus" },
  { href: "/sweep", label: "Sweep", icon: "refresh" },
  { href: "/rules", label: "Rules", icon: "scale" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/matters") return pathname === "/matters" || (pathname.startsWith("/matters/") && pathname !== "/matters/new");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Phone: tab bar fixed to the bottom of the screen. */
export function MobileTabBar() {
  return <TabList pathname={usePathname()} />;
}

export function TabList({ pathname }: { pathname: string }) {
  return (
    <ul className="grid grid-cols-5">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        const isNew = t.href === "/matters/new";
        return (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-navy-900" : "text-slate-500"}`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  isNew ? "bg-gold-400 text-navy-950" : active ? "bg-navy-50 text-navy-800" : ""
                }`}
              >
                <Icon name={t.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="flex items-center gap-1">
                {t.label}
                <LinkPending className="h-2.5 w-2.5" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
