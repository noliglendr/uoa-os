import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { inputClass } from "./styles";

export { inputClass };
// Submit button with a saving spinner (a client component).
export { Button } from "./submit-button";

// Small building blocks shared by every screen. Server components only.

/**
 * The navy banner at the top of every page: section label, title, a short
 * description, optional facts ("meta") and buttons. With `overlap`, it leaves
 * room for the next block (the dashboard's number tiles) to sit across its edge.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  meta,
  overlap,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  icon?: IconName;
  actions?: ReactNode;
  meta?: ReactNode;
  overlap?: boolean;
}) {
  return (
    <header className={`hero relative isolate overflow-hidden rounded-2xl bg-navy-900 px-6 pt-7 text-white shadow-lg shadow-navy-900/10 sm:px-8 ${overlap ? "pb-20" : "pb-7"}`}>
      <div className="hero-grid absolute inset-0 -z-10" aria-hidden />
      <div className="absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-gold-400/25 blur-3xl" aria-hidden />
      <div className="absolute -bottom-32 left-1/4 -z-10 h-72 w-96 rounded-full bg-navy-500/40 blur-3xl" aria-hidden />
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold-400 via-gold-300 to-transparent" aria-hidden />

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          {icon && (
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-300 ring-1 ring-inset ring-white/15 sm:flex">
              <Icon name={icon} className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-300">{eyebrow}</p>}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-100">{description}</p>}
            {meta && <div className="mt-4 flex flex-wrap gap-2">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A small fact on the page banner, e.g. "4 need you". */
export function HeroChip({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/15 backdrop-blur">
      {icon && <Icon name={icon} className="h-3.5 w-3.5 text-gold-300" />}
      {children}
    </span>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** No padding around the body (for lists that run edge to edge). */
  flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-navy-50 text-navy-700 ring-navy-200",
  gold: "bg-gold-100 text-gold-600 ring-gold-300",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Hidden({ values }: { values: Record<string, string | number | null | undefined> }) {
  return (
    <>
      {Object.entries(values).map(([name, value]) =>
        value == null ? null : <input key={name} type="hidden" name={name} value={String(value)} />,
      )}
    </>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-slate-500">{children}</p>;
}

export { Loading } from "./skeleton";

/** Shows the database's answer when it refused a change (passed as ?error=). */
export async function ErrorBanner({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const error = (await searchParams).error;
  if (!error) return null;
  return (
    <p role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span aria-hidden>⚠</span>
      <span>
        <strong>Not saved.</strong> {String(error)}
      </span>
    </p>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-slate-100 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-top ${className}`}>{children}</td>;
}

/** A labelled number on the dashboard. */
export function Stat({ label, value, tone = "gray", hint }: { label: string; value: ReactNode; tone?: "gray" | "amber" | "red" | "green"; hint?: string }) {
  const bar = { gray: "bg-slate-300", amber: "bg-gold-400", red: "bg-red-500", green: "bg-emerald-500" }[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden />
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Shown when someone opens a page their role doesn't use (decision #17). */
export function NotForYourRole({ who }: { who: string }) {
  return (
    <section className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-700">
        <Icon name="lock" className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">This page is for {who}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">Your role doesn&apos;t use it. If you need access, ask the principal.</p>
    </section>
  );
}
