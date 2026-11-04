import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { LoginIllustration } from "./login-illustration";

/**
 * Frame for the sign-in pages. Desktop: the firm's artwork and promise on the
 * left, the form on the right. Phone: the form only, with the firm's name on top.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-full flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Artwork panel */}
      <section className="hero sticky top-0 isolate hidden h-dvh flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-12">
        <div className="absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-gold-400/15 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 right-0 -z-10 h-96 w-[32rem] rounded-full bg-navy-500/30 blur-3xl" aria-hidden />
        <span className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-gold-400/60 to-transparent" aria-hidden />

        <Brand />

        {/* The artwork fills the space left between the name and the text, whatever the screen height */}
        <div className="relative my-4 min-h-0 flex-1">
          <LoginIllustration className="fade-in absolute inset-0 h-full w-full" />
        </div>

        <div className="max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Immigration practice · Frisco &amp; New York</p>
          <p className="mt-3 text-2xl font-semibold leading-snug xl:text-3xl">Every matter, from first inquiry to closed file.</p>
          <ul className="mt-6 grid gap-3 text-sm text-navy-100 sm:grid-cols-3">
            <Point icon="check">The attorney approves every key step</Point>
            <Point icon="clock">Every deadline tracked and reminded</Point>
            <Point icon="shield">Two-step sign-in, every change logged</Point>
          </ul>
        </div>
      </section>

      {/* Form panel */}
      <section className="flex flex-col bg-white px-6 py-10 sm:px-12">
        <div className="lg:hidden">
          <Brand dark />
        </div>
        <div className="fade-in m-auto w-full max-w-sm py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-400">
          <Icon name="lock" className="h-3.5 w-3.5" />
          Private system for UOA Legal staff. Protected with two-step sign-in.
        </p>
      </section>
    </main>
  );
}

function Brand({ dark }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gold-400 font-bold tracking-tight text-navy-950 shadow-sm">UOA</span>
      <span className="leading-tight">
        <span className={`block text-lg font-semibold ${dark ? "text-navy-900" : "text-white"}`}>UOA Legal</span>
        <span className={`block text-sm ${dark ? "text-slate-500" : "text-navy-300"}`}>Firm OS · Immigration</span>
      </span>
    </div>
  );
}

function Point({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gold-300 ring-1 ring-inset ring-white/15">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}
