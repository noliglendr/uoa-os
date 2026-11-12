"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * A row that opens and closes with a smooth slide, every time.
 * `summary` is the always-visible row; `children` is what opens below it.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  buttonClassName = "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50",
  chevron = true,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  buttonClassName?: string;
  chevron?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className={`group/d cursor-pointer transition-colors ${buttonClassName}`}>
        {chevron && (
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ease-out group-hover/d:text-slate-600 ${open ? "rotate-90" : ""}`}
          >
            <path d="M7.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {summary}
      </button>
      <div
        id={id}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`transition-transform duration-300 ease-out ${open ? "translate-y-0" : "-translate-y-2"}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
