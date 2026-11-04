"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass, inputClass } from "@/components/styles";

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

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account</h1>
        <p className="mt-1 text-sm text-slate-500">New staff: replace your temporary password here.</p>
      </div>
      <section className="max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Change password</h2>
        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">New password (12+ characters)</span>
            <input name="password" type="password" autoComplete="new-password" required className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Type it again</span>
            <input name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
          </label>
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending ? "Saving…" : "Change password"}
          </button>
          {status.error && <p role="alert" className="text-sm text-red-600">{status.error}</p>}
          {status.ok && <p className="text-sm text-emerald-700">{status.ok}</p>}
        </form>
      </section>
    </>
  );
}
