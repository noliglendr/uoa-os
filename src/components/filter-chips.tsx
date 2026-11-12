import Link from "next/link";

/**
 * One row of filter chips (server component). Each chip is a link to the same
 * page with that filter set, so filters survive a refresh and can be shared.
 */
export function FilterChips({
  label,
  options,
  active,
  href,
}: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  active: string;
  href: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {options.map((o) => {
        const on = o.value === active;
        return (
          <Link
            key={o.value}
            href={href(o.value)}
            scroll={false}
            aria-current={on ? "true" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 transition ${
              on ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {o.label}
            {o.count !== undefined && <span className="text-xs opacity-70">{o.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}

/** Builds a page address from filters, leaving out empty ones and defaults. */
export function filterHref(path: string, values: Record<string, string>, defaults: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v && v !== defaults[k]) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
