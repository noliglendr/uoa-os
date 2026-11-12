"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/submit-button";
import { updateSetting } from "../actions";

/** What the form holds now, to tell whether anything was changed. */
function snapshot(form: HTMLFormElement): string {
  return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
}

/**
 * One setting's form. Save and Cancel appear only after a change, so the page
 * stays quiet until Frank actually changes something.
 */
export function SettingForm({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  const initial = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function check() {
    const f = ref.current;
    if (!f) return;
    setDirty(snapshot(f) !== initial.current);
  }

  return (
    <form
      ref={(f) => {
        ref.current = f;
        if (f && initial.current === null) initial.current = snapshot(f);
      }}
      action={updateSetting}
      onChange={check}
      onInput={check}
      className="space-y-2"
    >
      {children}
      {dirty && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              ref.current?.reset();
              setDirty(false);
            }}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <Button variant="primary">Save</Button>
        </div>
      )}
    </form>
  );
}
