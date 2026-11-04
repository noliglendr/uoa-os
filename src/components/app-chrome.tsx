"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon, type IconName } from "./icons";
import { LinkPending } from "./link-pending";
import { inputClass } from "./styles";

// Parts of the top and bottom bars that depend on the current page.

const TITLES: [RegExp, string, string, IconName][] = [
  [/^\/$/, "Work", "My work", "home"],
  [/^\/matters\/new$/, "Work", "New matter", "plus"],
  [/^\/matters\/[^/]+$/, "Matters", "Matter details", "briefcase"],
  [/^\/matters$/, "Work", "Matters", "briefcase"],
  [/^\/sweep/, "Work", "Weekly sweep", "refresh"],
  [/^\/rules/, "Firm", "Deadline rules", "scale"],
  [/^\/staff/, "Firm", "Staff", "users"],
  [/^\/settings/, "Firm", "Settings", "cog"],
  [/^\/export/, "Firm", "Export", "download"],
  [/^\/account/, "You", "Account", "user"],
];

/**
 * Matter search in the top bar. Press Ctrl+K (or /) anywhere to jump to it.
 * Enter opens the Matters list filtered by the words typed.
 */
export function SearchBox() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing = (event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]");
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        const q = input.current?.value.trim() ?? "";
        router.push(q ? `/matters?q=${encodeURIComponent(q)}` : "/matters");
      }}
    >
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={input}
        type="search"
        placeholder="Search matters…"
        aria-label="Search matters"
        className={`${inputClass} h-10 w-64 rounded-lg bg-slate-50 pl-9 pr-14 focus:bg-white xl:w-80`}
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-400">
        Ctrl K
      </kbd>
    </form>
  );
}

/** "Work › My work" in the top bar. */
export function Breadcrumb() {
  const pathname = usePathname();
  const [, section, page, icon] = TITLES.find(([re]) => re.test(pathname)) ?? [null, "", "", "home" as IconName];
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700 ring-1 ring-inset ring-navy-100">
        <Icon name={icon} className="h-4 w-4" />
      </span>
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
