"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions";
import { Icon } from "./icons";

/** Top-bar avatar. Click it for a small menu: Account, Sign out. */
export function UserMenu({ name, role, email, initials }: { name: string; role: string; email: string | null; initials: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on a click outside the menu, or on Esc.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition hover:bg-slate-100 ${open ? "bg-slate-100" : ""}`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white ring-2 ring-gold-300/60">
          {initials}
        </span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-sm font-medium text-slate-900">{name.split(/\s+/)[0]}</span>
          <span className="block text-xs text-slate-500">{role}</span>
        </span>
        <Icon name="chevronDown" className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="drop-in absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-navy-900/10">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-white">{initials}</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-slate-900">{name}</span>
              <span className="block text-xs text-slate-500">{role}</span>
              {email && <span className="mt-0.5 block truncate text-xs text-slate-500">{email}</span>}
            </span>
          </div>
          <div className="p-1.5">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon name="user" className="h-4 w-4 text-slate-500" /> Account
            </Link>
            <form action={signOut}>
              <button type="submit" role="menuitem" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50">
                <Icon name="logout" className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
