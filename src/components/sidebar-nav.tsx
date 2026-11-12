"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { LinkPending } from "./link-pending";

// Who sees each item (decision #17). No list = everyone.
const MANAGERS = ["principal", "administrator"];
const EXPORTERS = ["principal", "attorney"];

type Item = { href: string; label: string; icon: IconName; roles?: string[] };
type Section = { title: string; items: Item[]; folded?: boolean };

const ATTORNEYS = ["principal", "attorney"];

/**
 * The attorney and principal see their daily pages first; staff chores and
 * firm setup are folded away. Other roles see their own work first.
 * "New matter" is the button at the top of every page.
 */
function sectionsFor(role?: string): Section[] {
  const outbox: Item = { href: "/outbox", label: "Client outbox", icon: "send", roles: ["principal", "attorney", "paralegal", "docketing"] };
  const sweep: Item = { href: "/sweep", label: "Weekly sweep", icon: "refresh", roles: ["principal", "attorney", "administrator", "paralegal", "docketing"] };
  const setup: Section = {
    title: "Firm setup",
    folded: true,
    items: [
      { href: "/rules", label: "Deadline rules", icon: "scale" },
      { href: "/templates", label: "Templates", icon: "mail" },
      { href: "/staff", label: "Staff", icon: "users", roles: MANAGERS },
      { href: "/settings", label: "Settings", icon: "cog", roles: MANAGERS },
      { href: "/export", label: "Export", icon: "download", roles: EXPORTERS },
    ],
  };
  const daily: Item[] = [
    { href: "/", label: "My work", icon: "home" },
    { href: "/matters", label: "Matters", icon: "briefcase" },
    { href: "/dashboard", label: "Firm dashboard", icon: "chart", roles: ["principal", "attorney", "administrator"] },
    { href: "/invoices", label: "Invoices", icon: "invoice", roles: ["principal", "attorney", "administrator"] },
  ];
  const sections: Section[] =
    role && ATTORNEYS.includes(role)
      ? [{ title: "Daily", items: daily }, { title: "Staff work", folded: true, items: [outbox, sweep] }, setup]
      : [{ title: "Work", items: [...daily, outbox, sweep] }, setup];
  sections.push({ title: "Help", items: [{ href: "/help", label: "How it works", icon: "info" }] });
  return sections.map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || (role && i.roles.includes(role))) })).filter((s) => s.items.length);
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/matters") return pathname === "/matters" || (pathname.startsWith("/matters/") && pathname !== "/matters/new");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ role }: { role?: string }) {
  return <NavList pathname={usePathname()} role={role} />;
}

/** The menu itself. Also the loading fallback (no item highlighted, role-limited items hidden). */
export function NavList({ pathname, role }: { pathname: string; role?: string }) {
  return (
    <nav className="space-y-5">
      {sectionsFor(role).map((s) =>
        s.folded ? (
          <Folded key={s.title} section={s} pathname={pathname} />
        ) : (
          <div key={s.title}>
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-navy-300">{s.title}</div>
            <Items items={s.items} pathname={pathname} />
          </div>
        ),
      )}
    </nav>
  );
}

/** A group that folds away; it opens by itself when one of its pages is open. */
function Folded({ section, pathname }: { section: Section; pathname: string }) {
  const here = section.items.some((i) => isActive(pathname, i.href));
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? here;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setChoice(!open)}
        className="flex w-full items-center gap-2 rounded-md px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-navy-300 hover:text-white"
      >
        <span className="flex-1 text-left">{section.title}</span>
        <svg aria-hidden viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? "rotate-90" : ""}`}>
          <path d="M7.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div inert={!open} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="min-h-0 overflow-hidden">
          <Items items={section.items} pathname={pathname} />
        </div>
      </div>
    </div>
  );
}

function Items({ items, pathname }: { items: Item[]; pathname: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-white/10 text-white shadow-[inset_3px_0_0_var(--color-gold-400)]" : "text-navy-100 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon name={item.icon} className={`h-[18px] w-[18px] ${active ? "text-gold-400" : "text-navy-300"}`} />
              <span className="flex-1">{item.label}</span>
              <LinkPending className="h-3.5 w-3.5 text-gold-400" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Phone and tablet: the same menu behind a ☰ button. */
export function MobileMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="rounded-md p-2 text-navy-900 hover:bg-slate-100"
      >
        <Icon name={open ? "close" : "menu"} className="h-5 w-5" />
      </button>
      {open && (
        // Tapping a link closes the menu.
        <div
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className="drop-in absolute inset-x-0 top-full z-40 border-t border-white/10 bg-navy-900 px-3 py-4 shadow-lg"
        >
          {children}
        </div>
      )}
    </>
  );
}
