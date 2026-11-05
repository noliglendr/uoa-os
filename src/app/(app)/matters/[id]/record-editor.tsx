"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { Button } from "@/components/submit-button";
import { buttonClass, inputClass } from "@/components/styles";
import { editRecord, markEnteredInError, type CorrectionState } from "../../actions";

export type EditField = {
  /** Column name; "fee" is entered in dollars. */
  name: string;
  label: string;
  type?: "text" | "date" | "select" | "number";
  value: string | number | null | undefined;
  options?: Record<string, string>;
  required?: boolean;
  hint?: string;
};

export type CorrectionTable = "parties" | "filings" | "notices" | "deadlines" | "checklist_items";

/**
 * "Edit" on a matter row (decision #20): fix a typo, or mark the row as entered
 * in error. Nothing is deleted: the old value and the marked row stay in History.
 */
export function RecordEditor({
  table,
  id,
  title,
  fields,
  canVoid,
  note,
  back,
}: {
  table: CorrectionTable;
  id: string;
  title: string;
  fields: EditField[];
  canVoid: boolean;
  /** Shown above the fields, e.g. "A new date needs the attorney's verification again." */
  note?: string;
  back: string;
}) {
  const [open, setOpen] = useState(false);
  const [saved, save] = useActionState<CorrectionState, FormData>(editRecord, null);
  const [voided, markVoid] = useActionState<CorrectionState, FormData>(markEnteredInError, null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const hidden = (
    <>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
    </>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "h-7 px-2 text-xs")} aria-label={`Edit ${title}`}>
        <Icon name="cog" className="h-3.5 w-3.5" /> Edit
      </button>

      {/* Drawn on the page body, so no card or animation can clip or pin it. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Edit ${title}`}
              onMouseDown={(event) => event.stopPropagation()}
              className="drop-in flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-left shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Edit {title}</h2>
                  <p className="text-xs text-slate-500">Every change is logged with your name. Nothing is deleted.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </div>

              <div className="divide-y divide-slate-100 overflow-y-auto">
                {/* Fix a mistake */}
                <form action={save} className="space-y-3 px-5 py-4">
                  {hidden}
                  {note && <p className="rounded-lg bg-gold-100/60 px-3 py-2 text-xs text-slate-700">{note}</p>}
                  {fields.map((f) => (
                    <label key={f.name} className="block space-y-1">
                      <span className="text-sm font-medium text-slate-700">{f.label}</span>
                      {f.type === "select" ? (
                        <select name={`f_${f.name}`} defaultValue={String(f.value ?? "")} className={`${inputClass} h-9 w-full`}>
                          {Object.entries(f.options ?? {}).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          name={`f_${f.name}`}
                          type={f.type === "number" ? "text" : (f.type ?? "text")}
                          inputMode={f.type === "number" ? "decimal" : undefined}
                          defaultValue={f.value ?? ""}
                          required={f.required}
                          className={`${inputClass} h-9 w-full`}
                        />
                      )}
                      {f.hint && <span className="block text-xs text-slate-500">{f.hint}</span>}
                    </label>
                  ))}
                  <div className="flex items-center justify-between gap-3">
                    <Result state={saved} />
                    <Button variant="primary" className="ml-auto h-9">
                      Save changes
                    </Button>
                  </div>
                </form>

                {/* Take it out of the work, keep it in the record */}
                {canVoid && (
                  <form action={markVoid} className="space-y-2 bg-red-50/40 px-5 py-4">
                    {hidden}
                    <div>
                      <p className="text-sm font-medium text-red-800">Entered in error</p>
                      <p className="text-xs text-slate-500">
                        Added by mistake? It leaves the lists and the checks, but stays in History and the export. This can&apos;t be undone.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input name="reason" required placeholder="Reason, e.g. logged on the wrong matter" className={`${inputClass} h-9 flex-1`} />
                      <ConfirmButton variant="danger" className="h-9" confirm={`Mark ${title} as entered in error?\n\nIt leaves the work but stays in History. This can't be undone and is logged with your name.`}>
                        Mark
                      </ConfirmButton>
                    </div>
                    <Result state={voided} />
                  </form>
                )}
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

function Result({ state }: { state: CorrectionState }) {
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
