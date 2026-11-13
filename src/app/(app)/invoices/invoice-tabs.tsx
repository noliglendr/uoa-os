"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

export type Tab = { view: string; title: string; icon: IconName; count: number; total: string; tone: string; href: string };

/**
 * The four cards at the top of Invoices. All four lists arrive with the page,
 * so switching is instant: no trip to the server. The address bar follows,
 * so a refresh or a shared link opens the same list.
 */
export function InvoiceTabs({ tabs, panels, initial }: { tabs: Tab[]; panels: Record<string, ReactNode>; initial: string }) {
  const [view, setView] = useState(initial);
  return (
    <>
      <div role="tablist" aria-label="Invoices" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tabs.map((t) => {
          const current = t.view === view;
          return (
            <button
              key={t.view}
              type="button"
              role="tab"
              aria-selected={current}
              onClick={() => {
                setView(t.view);
                window.history.replaceState(window.history.state, "", t.href);
              }}
              className={`cursor-pointer rounded-xl border border-l-4 bg-white px-4 py-3 text-left shadow-sm transition ${t.tone} ${
                current ? "border-y-navy-800 border-r-navy-800 ring-1 ring-navy-800" : "border-y-slate-200 border-r-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Icon name={t.icon} className="h-4 w-4" /> {t.title}
              </span>
              <span className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-slate-900">{t.count}</span>
                <span className="truncate text-sm text-slate-600">{t.count ? t.total : ""}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div key={view} role="tabpanel" className="drop-in">
        {panels[view]}
      </div>
    </>
  );
}
