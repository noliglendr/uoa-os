"use client";

import { useActionState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { setStaffAccess, type EditStaffState } from "./actions";

/** "Switch off / on access" for one person. The result shows under the button. */
export function AccessButton({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [state, action] = useActionState<EditStaffState, FormData>(setStaffAccess, null);
  return (
    <form action={action} className="mt-1 space-y-1">
      <input type="hidden" name="profile_id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <ConfirmButton
        variant={active ? "danger" : "secondary"}
        confirm={active ? `Switch off access for ${name}? They can no longer sign in.` : `Switch access back on for ${name}?`}
      >
        {active ? "Switch off access" : "Switch on access"}
      </ConfirmButton>
      {state?.error && (
        <p role="alert" className="max-w-48 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-xs text-emerald-700">
          {state.ok}
        </p>
      )}
    </form>
  );
}
