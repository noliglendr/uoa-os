"use client";

import { useState } from "react";
import { Icon } from "./icons";

/**
 * "Not saved" message, pinned to the top of the screen so it is seen even when
 * the form was far down the page. Stays until closed or the next change.
 */
export function ErrorToast({ message }: { message: string }) {
  const [closed, setClosed] = useState<string | null>(null);
  if (closed === message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <p
        role="alert"
        className="drop-in pointer-events-auto flex w-full max-w-xl items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg shadow-red-900/10"
      >
        <span aria-hidden>⚠</span>
        <span className="flex-1">
          <strong>Not saved.</strong> {message}
        </span>
        <button type="button" onClick={() => setClosed(message)} aria-label="Close" className="-m-1 rounded p-1 text-red-500 hover:bg-red-100 hover:text-red-800">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </p>
    </div>
  );
}
