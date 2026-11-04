"use client";

import { useState } from "react";
import { NETWORK_MESSAGE, createClient, withTimeout } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { buttonClass, inputClass } from "@/components/styles";

const RULES = [
  { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { label: "Upper and lower case letters", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: "At least one number", test: (p: string) => /\d/.test(p) },
  { label: "At least one symbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const STRENGTH = [
  { label: "Too weak", bar: "bg-red-500", text: "text-red-700" },
  { label: "Weak", bar: "bg-red-500", text: "text-red-700" },
  { label: "Fair", bar: "bg-gold-400", text: "text-gold-600" },
  { label: "Good", bar: "bg-emerald-500", text: "text-emerald-700" },
  { label: "Strong", bar: "bg-emerald-600", text: "text-emerald-700" },
];

/** Change your own password (new staff replace the temporary one here). */
export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok?: string; error?: string }>({});
  const [pending, setPending] = useState(false);

  const passed = RULES.filter((r) => r.test(password)).length;
  const strength = STRENGTH[password ? passed : 0];
  const matches = confirm.length > 0 && confirm === password;
  // Length is required; the other rules make it stronger.
  const ready = RULES[0].test(password) && matches;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    setPending(true);
    setStatus({});
    let error: { message: string } | null = null;
    try {
      ({ error } = await withTimeout(createClient().auth.updateUser({ password })));
    } catch {
      setPending(false);
      return setStatus({ error: NETWORK_MESSAGE });
    }
    setPending(false);
    if (error) return setStatus({ error: error.message });
    setPassword("");
    setConfirm("");
    setStatus({ ok: "Password changed. Use it the next time you sign in." });
  }

  const field = `${inputClass} h-10 w-full pr-10`;
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">New password</span>
        <span className="relative block">
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
            required
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
          >
            <Icon name={show ? "eyeOff" : "eye"} className="h-4 w-4" />
          </button>
        </span>
      </label>

      {/* Strength meter and rules */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="grid flex-1 grid-cols-4 gap-1.5">
            {RULES.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-colors duration-300 ${password && i < passed ? strength.bar : "bg-slate-200"}`} />
            ))}
          </div>
          <span className={`w-16 text-right text-xs font-medium ${password ? strength.text : "text-slate-400"}`}>{password ? strength.label : "—"}</span>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {RULES.map((r) => {
            const ok = r.test(password);
            return (
              <li key={r.label} className={`flex items-center gap-2 text-xs ${ok ? "text-emerald-700" : "text-slate-500"}`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded-full ${ok ? "bg-emerald-100" : "bg-slate-100"}`}>
                  {ok ? <Icon name="check" className="h-3 w-3" /> : <span className="h-1 w-1 rounded-full bg-slate-400" />}
                </span>
                {r.label}
              </li>
            );
          })}
        </ul>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Type it again</span>
        <span className="relative block">
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={field}
            required
          />
          {confirm && (
            <span className={`absolute right-3 top-1/2 -translate-y-1/2 ${matches ? "text-emerald-600" : "text-red-500"}`}>
              <Icon name={matches ? "check" : "close"} className="h-4 w-4" />
            </span>
          )}
        </span>
        {confirm && !matches && <span className="block text-xs text-red-600">The two passwords don&apos;t match yet.</span>}
      </label>

      {status.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {status.error}
        </p>
      )}
      {status.ok && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Icon name="check" className="h-4 w-4" /> {status.ok}
        </p>
      )}

      <button type="submit" disabled={!ready || pending} className={buttonClass("primary", "h-10 w-full rounded-lg")}>
        {pending ? <Spinner className="h-4 w-4" /> : <Icon name="lock" className="h-4 w-4" />}
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
