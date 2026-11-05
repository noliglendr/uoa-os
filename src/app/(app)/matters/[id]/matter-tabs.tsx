"use client";

import { useState, type MouseEvent, type ReactNode } from "react";

export type MatterTab = { id: string; label: string; n?: number; alert?: boolean };

/**
 * The matter page tabs. Every tab arrives with the page, so switching happens in
 * the browser with no trip to the server; the address bar keeps ?tab= so a
 * reload, a link or a save comes back to the same tab.
 */
export function MatterTabs({ tabs, initial, panels }: { tabs: MatterTab[]; initial: string; panels: Record<string, ReactNode> }) {
  const [tab, setTab] = useState(initial);
  // A new page from the server (after a save, or a ?tab= link) picks the tab again.
  const [shown, setShown] = useState(initial);
  if (initial !== shown) {
    setShown(initial);
    setTab(initial);
  }

  function select(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; // open in a new tab as usual
    event.preventDefault();
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <>
      <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Matter sections">
        <ul className="flex min-w-max gap-1 border-b border-slate-200">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <li key={t.id}>
                <a
                  href={`?tab=${t.id}`}
                  onClick={(event) => select(event, t.id)}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium ${
                    active ? "border-navy-800 text-navy-900" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                  {!!t.n && (
                    <span className={`rounded-full px-1.5 text-xs ${t.alert ? "bg-gold-100 text-gold-600" : "bg-slate-100 text-slate-600"}`}>{t.n}</span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div key={tab} className="fade-in space-y-5">
        {panels[tab]}
      </div>
    </>
  );
}
