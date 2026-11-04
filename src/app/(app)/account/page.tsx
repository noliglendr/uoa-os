"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Change your own password (new staff replace the temporary one here).
export default function AccountPage() {
  const [status, setStatus] = useState<{ ok?: string; error?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const password = String(form.get("password"));
    if (password.length < 12) return setStatus({ error: "Use at least 12 characters." });
    if (password !== String(form.get("confirm"))) return setStatus({ error: "The two passwords don't match." });
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (error) return setStatus({ error: error.message });
    element.reset();
    setStatus({ ok: "Password changed." });
  }

  const input = "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <>
      <h1 className="text-2xl font-semibold">Account</h1>
      <section className="max-w-md rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 font-semibold">Change password</h2>
        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">New password (12+ characters)</span>
            <input name="password" type="password" autoComplete="new-password" required className={input} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Type it again</span>
            <input name="confirm" type="password" autoComplete="new-password" required className={input} />
          </label>
          <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            {pending ? "Saving…" : "Change password"}
          </button>
          {status.error && <p role="alert" className="text-sm text-red-600">{status.error}</p>}
          {status.ok && <p className="text-sm text-emerald-700">{status.ok}</p>}
        </form>
      </section>
    </>
  );
}
