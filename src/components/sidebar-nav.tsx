"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { LinkPending } from "./link-pending";

// Who sees each item (decision #17). No list = everyone.
const MANAGERS = ["principal", "administrator"];
const EXPORTERS = ["principal", "attorney"];

const SECTIONS: { title: string; items: { href: string; label: string; icon: IconName; roles?: string[] }[] }[] = [
  {
    title: "Work",
    items: [
      { href: "/", label: "My work", icon: "home" },
      { href: "/matters", label: "Matters", icon: "briefcase" },
      { href: "/matters/new", label: "New matter", icon: "plus" },
      { href: "/sweep", label: "Weekly sweep", icon: "refresh", roles: ["principal", "attorney", "administrator", "paralegal", "docketing"] },
    ],
  },
  {
    title: "Firm",
    items: [
      { href: "/rules", label: "Deadline rules", icon: "scale" },
      { href: "/staff", label: "Staff", icon: "users", roles: MANAGERS },
      { href: "/settings", label: "Settings", icon: "cog", roles: MANAGERS },
      { href: "/export", label: "Export", icon: "download", roles: EXPORTERS },
    ],
  },
];

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
    <nav className="space-y-6">
      {SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || (role && i.roles.includes(role))) })).map((s) => (
        <div key={s.title}>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-navy-300">{s.title}</div>
          <ul className="space-y-0.5">
            {s.items.map((item) => {
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
        </div>
      ))}
    </nav>
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
