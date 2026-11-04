"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { Button } from "@/components/submit-button";
import { buttonClass, inputClass } from "@/components/styles";
import { removeStaff, renameStaff, resetStaffPassword, resetStaffTwoStep, type EditStaffState } from "./actions";

/** "Edit" on a staff row: name, new temporary password, two-step reset. */
export function EditStaff({ id, name, email, role }: { id: string; name: string; email?: string; role: string }) {
  const [open, setOpen] = useState(false);
  const [renamed, rename] = useActionState<EditStaffState, FormData>(renameStaff, null);
  const [reset, resetPassword] = useActionState<EditStaffState, FormData>(resetStaffPassword, null);
  const [twoStep, resetTwoStep] = useActionState<EditStaffState, FormData>(resetStaffTwoStep, null);
  const [removed, remove] = useActionState<EditStaffState, FormData>(removeStaff, null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary")}>
        <Icon name="cog" className="h-3.5 w-3.5" /> Edit
      </button>

      {/* Drawn on the page body, so no card or animation can clip or pin it. */}
      {open &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${name}`}
            onMouseDown={(event) => event.stopPropagation()}
            className="drop-in flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-left shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Edit {name}</h2>
                <p className="text-xs text-slate-500">
                  {role}
                  {email && <> · {email}</>}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 overflow-y-auto">
              {/* Name */}
              <form action={rename} className="space-y-2 px-5 py-4">
                <input type="hidden" name="profile_id" value={id} />
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Name</span>
                  <div className="flex gap-2">
                    <input name="display_name" defaultValue={name} required className={`${inputClass} h-9 flex-1`} />
                    <Button variant="primary" className="h-9">
                      Save
                    </Button>
                  </div>
                </label>
                <Result state={renamed} />
              </form>

              {/* Password */}
              <form action={resetPassword} className="space-y-2 px-5 py-4">
                <input type="hidden" name="profile_id" value={id} />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Password</p>
                    <p className="text-xs text-slate-500">Forgot it? Give a new temporary password.</p>
                  </div>
                  <ConfirmButton variant="secondary" confirm={`Give ${name} a new temporary password?\n\nTheir current password stops working. This is logged.`}>
                    <Icon name="lock" className="h-3.5 w-3.5" /> Reset
                  </ConfirmButton>
                </div>
                {reset?.password ? (
                  <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    <p>{reset.ok} Give it by phone or in person, never by email. It is shown only once.</p>
                    <p className="select-all font-mono text-base">{reset.password}</p>
                  </div>
                ) : (
                  <Result state={reset} />
                )}
              </form>

              {/* Two-step sign-in */}
              <form action={resetTwoStep} className="space-y-2 px-5 py-4">
                <input type="hidden" name="profile_id" value={id} />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Two-step sign-in</p>
                    <p className="text-xs text-slate-500">New or lost phone? They scan a new QR code next time.</p>
                  </div>
                  <ConfirmButton variant="danger" confirm={`Reset two-step sign-in for ${name}?\n\nTheir authenticator app stops working; they set it up again at the next sign-in. This is logged.`}>
                    <Icon name="shield" className="h-3.5 w-3.5" /> Reset
                  </ConfirmButton>
                </div>
                <Result state={twoStep} />
              </form>

              {/* Remove: only for accounts that never did anything */}
              <form action={remove} className="space-y-2 bg-red-50/40 px-5 py-4">
                <input type="hidden" name="profile_id" value={id} />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-red-800">Remove from the system</p>
                    <p className="text-xs text-slate-500">Only for accounts with no activity (a mistake or a test). Anyone with history stays: switch off their access instead.</p>
                  </div>
                  <ConfirmButton variant="danger" confirm={`Remove ${name} completely?

Their account and login are deleted. This can't be undone. It is logged.`}>
                    Remove
                  </ConfirmButton>
                </div>
                <Result state={removed} />
              </form>
            </div>

            <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-3">
              <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")}>
                Done
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}

function Result({ state }: { state: EditStaffState }) {
  if (state?.error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-700">
        <Icon name="check" className="h-4 w-4" /> {state.ok}
      </p>
    );
  }
  return null;
}
