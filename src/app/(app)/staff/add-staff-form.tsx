"use client";

import { useActionState } from "react";
import { buttonClass, inputClass as input } from "@/components/styles";
import { createStaff, type CreateStaffState } from "./actions";


export function AddStaffForm({ principal }: { principal: boolean }) {
  const [state, action, pending] = useActionState<CreateStaffState, FormData>(createStaff, null);

  if (state?.created) {
    return (
      <div className="space-y-2 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm">
        <p>
          <strong>Account created for {state.created.email}.</strong> Give them this temporary password in person or by
          phone (not by email). It is shown only once.
        </p>
        <p className="font-mono text-base">{state.created.password}</p>
        <p>
          They sign in at the app, set up their authenticator app, then change the password on the Account page.
        </p>
        <button type="button" onClick={() => window.location.reload()} className="underline">
          Done
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Name</span>
        <input name="display_name" required className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Work email</span>
        <input name="email" type="email" required className={`${input} w-64`} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Role</span>
        <select name="role" className={input} defaultValue="paralegal">
          {principal && <option value="attorney">Attorney</option>}
          <option value="paralegal">Paralegal</option>
          <option value="docketing">Docketing</option>
          <option value="intake">Intake</option>
          <option value="administrator">Administrator</option>
          {principal && <option value="principal">Principal</option>}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary")}
      >
        {pending ? "Creating…" : "Add staff member"}
      </button>
      {state?.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
