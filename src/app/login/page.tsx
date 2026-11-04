"use client";

import { useState } from "react";
import { NETWORK_MESSAGE, createClient, withTimeout } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { buttonClass, inputClass } from "@/components/styles";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    let error: unknown = null;
    try {
      ({ error } = await withTimeout(supabase.auth.signInWithPassword({ email, password })));
    } catch {
      setError(NETWORK_MESSAGE);
      setPending(false);
      return;
    }

    if (error) {
      // Same message for every failure, so the page does not reveal which emails exist.
      setError("Email or password is incorrect.");
      setPending(false);
      return;
    }

    // Password is step 1 of 2. The proxy keeps the user on /mfa until step 2 is done.
    // A full page load picks up the new session cookies reliably.
    window.location.replace("/mfa");
  }

  const field = `${inputClass} h-11 w-full rounded-lg pl-10`;
  return (
    <AuthShell title="Welcome back" subtitle="Sign in with your firm account. You'll confirm with your authenticator app next.">
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <span className="relative block">
            <Icon name="mail" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              autoComplete="username"
              required
              placeholder="you@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <span className="relative block">
            <Icon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${field} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
            >
              <Icon name={show ? "eyeOff" : "eye"} className="h-4 w-4" />
            </button>
          </span>
        </label>

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <Icon name="alert" className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <button type="submit" disabled={pending} className={buttonClass("primary", "h-11 w-full rounded-lg text-[15px]")}>
          {pending ? <Spinner className="h-4 w-4" /> : null}
          {pending ? "Signing in…" : "Sign in"}
          {!pending && <Icon name="arrowRight" className="h-4 w-4" />}
        </button>

        <p className="text-center text-xs text-slate-500">Forgot your password or changed phones? Ask the principal or an administrator to reset it.</p>
      </form>
    </AuthShell>
  );
}
