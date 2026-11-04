import type { ReactNode } from "react";

/** Frame for the sign-in pages: firm name on navy, the form on a white card. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-navy-900 px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gold-400 font-bold tracking-tight text-navy-950">UOA</span>
        <span className="leading-tight">
          <span className="block text-lg font-semibold text-white">UOA Legal</span>
          <span className="block text-sm text-navy-300">Firm OS · Immigration</span>
        </span>
      </div>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-navy-300">Private system for UOA Legal staff. Every sign-in is protected with two steps.</p>
    </main>
  );
}
