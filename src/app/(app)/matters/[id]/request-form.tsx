"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/submit-button";
import { inputClass } from "@/components/styles";
import { createDocRequest, type DocRequestResult } from "../../actions";
import { CopyButton } from "./copy-button";

/** New document request. The link and code are shown here once, then never again. */
export function RequestForm({
  matterId,
  items,
  parties,
  defaultDue,
}: {
  matterId: string;
  items: { id: string; label: string; owner: string }[];
  parties: { id: string; label: string }[];
  defaultDue: string;
}) {
  const [result, action] = useActionState<DocRequestResult, FormData>(createDocRequest, null);
  const [done, setDone] = useState<string | null>(null);

  if (result?.link && result.link !== done) {
    return (
      <div className="space-y-3 rounded-lg border border-gold-300 bg-gold-100/40 p-4">
        <p className="text-sm font-semibold text-slate-900">Link created. Copy these now: they are not shown again.</p>
        <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
          <li>
            <strong>Email to the client</strong> (fill in [CLIENT NAME]; it holds the link):
            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-800">{result.email}</pre>
            <div className="mt-1">
              <CopyButton text={result.email ?? ""} />
            </div>
          </li>
          <li>
            <strong>Code, by phone or text message</strong> (never in the same email):{" "}
            <span className="ml-1 rounded bg-white px-2 py-1 font-mono text-lg tracking-[0.3em] text-slate-900 ring-1 ring-slate-200">{result.code}</span>
          </li>
          <li className="break-all">
            Link only: <span className="font-mono text-xs">{result.link}</span> <CopyButton text={result.link} />
          </li>
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Lost them? Cancel this link and create a new one.</p>
          <button type="button" onClick={() => setDone(result.link ?? null)} className="text-sm font-medium text-navy-700 hover:underline">
            Done: make another request
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="matter_id" value={matterId} />
      <p className="text-sm font-semibold text-slate-900">Request documents from the client</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No open client or third-party items. Add them to the evidence checklist first.</p>
      ) : (
        <fieldset className="space-y-1.5">
          {items.map((i) => (
            <label key={i.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="item" value={i.id} defaultChecked className="h-4 w-4 rounded border-slate-300 accent-navy-800" />
              {i.label} <span className="text-xs text-slate-500">({i.owner === "third_party" ? "third party" : "client"})</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Due date</span>
          <input type="date" name="due_date" required defaultValue={defaultDue} className={inputClass} />
        </label>
        {parties.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">For</span>
            <select name="party_id" className={inputClass}>
              <option value="">Not set</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button variant="primary" disabled={items.length === 0}>
          Create upload link
        </Button>
      </div>
      {result?.error && !result.link && (
        <p role="alert" className="text-sm text-red-700">
          {result.error}
        </p>
      )}
    </form>
  );
}
