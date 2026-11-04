"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/icons";
import { buttonClass } from "@/components/styles";

// Shown instead of a page that failed to load (for example a short network
// drop between the server and the database). Nothing is lost: saves either
// finish or are refused, and the page can simply be loaded again.
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
  const network = /fetch failed|timeout|network|ECONN|ENOTFOUND/i.test(message);
  const digest = (error as { digest?: string })?.digest;

  return (
    <section className="fade-in mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-slate-200 bg-white px-8 py-12 text-center shadow-sm">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600 ring-8 ring-gold-100/40">
        <Icon name="alert" className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-xl font-semibold text-slate-900">{network ? "Couldn’t reach the database" : "This page didn’t load"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        {network
          ? "The connection dropped for a moment. Check your internet, then try again. Nothing was lost."
          : "Something went wrong while loading this page. Try again; if it keeps happening, tell the administrator."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("primary", "h-10 rounded-lg px-5")}>
          <Icon name="refresh" /> Try again
        </button>
        <Link href="/" className={buttonClass("secondary", "h-10 rounded-lg px-5")}>
          Go to My work
        </Link>
      </div>
      {digest && <p className="mt-6 text-xs text-slate-400">Reference: {digest}</p>}
    </section>
  );
}
