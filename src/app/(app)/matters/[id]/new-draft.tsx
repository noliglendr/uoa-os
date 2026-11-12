"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { buttonClass, inputClass, letterBoxClass, letterRows } from "@/components/styles";
import { CASE_FACT_KINDS, STATEMENT_PURPOSES, type DraftKind } from "@/lib/drafting";
import { previewDraft, saveNewDraft, type DraftInput } from "../../actions";

type Option = { value: string; label: string };

/**
 * "Make draft" shows the letter in a window first. "Save draft" stores it and
 * sends it to the attorney; "Cancel" closes the window and nothing is saved.
 */
export function NewDraft({
  matterId,
  letters,
  filings,
  cycles = [],
  parties = [],
  caseFacts = false,
}: {
  matterId: string;
  letters: Option[];
  filings: Option[];
  /** Step B: RFE/NOID responses on this matter. */
  cycles?: Option[];
  parties?: Option[];
  /** D24: case facts may go to the AI. */
  caseFacts?: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState(letters[0]?.value ?? "");
  const [filingId, setFilingId] = useState("");
  const [cycleId, setCycleId] = useState(cycles[0]?.value ?? "");
  const [partyId, setPartyId] = useState("");
  const [purpose, setPurpose] = useState("personal");
  const [lines, setLines] = useState("");
  const stepB = CASE_FACT_KINDS.includes(kind as DraftKind);
  const [preview, setPreview] = useState<{ text: string; model: string; input: DraftInput } | null>(null);
  const [edited, setEdited] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [making, startMaking] = useTransition();
  const [saving, startSaving] = useTransition();
  const label = letters.find((l) => l.value === preview?.input.kind)?.label ?? "Letter";

  const close = () => {
    if (saving) return;
    if (preview && edited !== preview.text && !window.confirm("Close without saving? Your changes will be lost.")) return;
    setPreview(null);
    setError(null);
  };

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const make = () =>
    startMaking(async () => {
      setError(null);
      const input: DraftInput = stepB
        ? { matterId, kind: kind as DraftKind, filingId: null, cycleId: cycleId || null, partyId: partyId || null, purpose, lines }
        : { matterId, kind: kind as DraftKind, filingId: filingId || null };
      const result = await previewDraft(input);
      if ("error" in result) setError(result.error);
      else {
        setPreview({ ...result, input });
        setEdited(result.text);
      }
    });

  const save = () =>
    startSaving(async () => {
      if (!preview) return;
      setError(null);
      if (!edited.trim()) {
        setError("The letter is empty. Write something or press Cancel.");
        return;
      }
      const result = await saveNewDraft({ ...preview.input, text: preview.text, model: preview.model, edited });
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview(null);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-600">Letter</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
            {letters.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        {!stepB && filings.length > 0 && (
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-600">Filing (optional)</span>
            <select value={filingId} onChange={(e) => setFilingId(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {filings.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {stepB && kind === "response_outline" && (
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-600">Response</span>
            <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} className={inputClass}>
              {cycles.length === 0 && <option value="">No RFE or NOID response yet</option>}
              {cycles.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {stepB && kind === "statement_draft" && (
          <>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-600">Who speaks</span>
              <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className={inputClass}>
                <option value="">The client</option>
                {parties.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-600">Kind of statement</span>
              <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputClass}>
                {Object.entries(STATEMENT_PURPOSES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {!stepB && (
          <button type="button" onClick={make} disabled={making} className={buttonClass("primary")}>
            {making ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="plus" />} Make draft
          </button>
        )}
      </div>
      {stepB &&
        (!caseFacts ? (
          <p className="rounded-lg border border-gold-300 bg-gold-100/50 px-3 py-2 text-sm text-slate-700">
            This draft sends case facts to the AI. Turn on “Send case facts to the AI” in Settings first.
          </p>
        ) : (
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-slate-600">
                {kind === "response_outline" ? "Issues in the notice, one per line" : "Facts, one per line, in order"}
              </span>
              <textarea
                value={lines}
                onChange={(e) => setLines(e.target.value)}
                rows={6}
                placeholder={
                  kind === "response_outline"
                    ? "Evidence of the petitioner's ability to pay the proffered wage\nEvidence that the beneficiary has the required degree"
                    : "Met the spouse at a community event in spring of [YEAR]\nMarried in a civil ceremony; family attended"
                }
                className={`${inputClass} w-full`}
              />
              <span className="block text-xs text-slate-500">
                Role words only (client, spouse, employer). Never names, A-numbers, receipt numbers, birth dates or addresses: write a blank such as [SPOUSE NAME] instead.
              </span>
            </label>
            <button type="button" onClick={make} disabled={making || !lines.trim() || (kind === "response_outline" && !cycleId)} className={buttonClass("primary")}>
              {making ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="plus" />} Make draft
            </button>
          </div>
        ))}
      {error && !preview && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Drawn on the page body, so no card can clip it. */}
      {preview &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-sm" onMouseDown={close}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`New draft: ${label}`}
              onMouseDown={(event) => event.stopPropagation()}
              className="drop-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-left shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">New draft: {label}</h2>
                  <p className="text-xs text-slate-500">Not saved yet · {preview.model}</p>
                </div>
                <button type="button" onClick={close} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-4">
                <textarea
                  value={edited}
                  onChange={(e) => setEdited(e.target.value)}
                  rows={letterRows(preview.text)}
                  disabled={saving}
                  aria-label="Letter text"
                  className={letterBoxClass}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>Keep blanks such as [CLIENT NAME]: staff fill them in after approval. Never type client details here.</span>
                  {edited !== preview.text && (
                    <button type="button" onClick={() => setEdited(preview.text)} disabled={saving} className="font-medium text-navy-700 hover:underline">
                      Undo my changes
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">Save draft sends it to the attorney for approval. Cancel closes this window and saves nothing.</p>
                {error && (
                  <p role="alert" className="mt-2 text-sm text-red-700">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
                <button type="button" onClick={close} disabled={saving} className={buttonClass("secondary")}>
                  Cancel
                </button>
                <button type="button" onClick={save} disabled={saving} className={buttonClass("primary")}>
                  {saving ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" />} Save draft
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
