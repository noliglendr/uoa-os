import Link from "next/link";
import { Badge, Button, Card, Empty, Field, Hidden, inputClass, letterBoxClass, letterRows, type Tone } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { formatDateTime } from "@/lib/labels";
import { reviewDraft, saveDraft } from "../../actions";
import { CopyButton } from "./copy-button";
import { NewDraft } from "./new-draft";
import type { MatterData } from "./sections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_review: { label: "DRAFT: waiting for the attorney", tone: "amber" },
  changes_requested: { label: "DRAFT: sent back", tone: "red" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "gray" },
};

/** AI first drafts of letters. The attorney approves each one; the system sends nothing. */
export function DraftsCard({ d }: { d: MatterData }) {
  const ready = d.draftTemplates.filter((t) => t.attorney_approved);
  const labels = new Map<string, string>(d.draftTemplates.map((t) => [t.kind, t.label]));

  return (
    <>
      <Card title="New draft" description="Nothing is saved until you press Save draft.">
        {!d.draftingEnabled ? (
          <Empty>AI drafts are off. The principal can turn them on in Settings.</Empty>
        ) : ready.length === 0 ? (
          <Empty>
            No template is approved yet. The attorney approves each one on the{" "}
            <Link href="/templates" className="font-medium text-navy-700 hover:underline">
              Templates
            </Link>{" "}
            page.
          </Empty>
        ) : !d.open || !d.canDraft ? (
          <Empty>{d.open ? "Only the attorney, principal or paralegal can make a draft." : "This matter is no longer open."}</Empty>
        ) : (
          <NewDraft
            matterId={d.matter.id}
            letters={ready.map((t) => ({ value: t.kind, label: t.label }))}
            filings={d.filings.map((f) => ({ value: f.id, label: f.form_type }))}
            cycles={d.cycles
              .filter((c) => c.kind === "rfe" || c.kind === "noid")
              .map((c) => ({
                value: c.id,
                label: `${c.kind.toUpperCase()} response on ${d.filings.find((f) => f.id === c.filing_id)?.form_type ?? "a filing"}${c.status === "open" ? "" : ` (${c.status})`}`,
              }))}
            parties={d.parties.map((p) => ({ value: p.id, label: p.label }))}
            caseFacts={d.caseFacts}
          />
        )}
      </Card>

      <Card title="Drafts" flush>
        {d.drafts.length === 0 ? (
          <div className="px-4 py-2">
            <Empty>No drafts yet.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.drafts.map((x) => (
              <Draft key={x.id} x={x} d={d} title={labels.get(x.kind) ?? x.kind} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Draft({ x, d, title }: { x: Row; d: MatterData; title: string }) {
  const status = STATUS[x.status];
  const editable = d.open && d.canDraft && (x.status === "pending_review" || x.status === "changes_requested");
  const reviewable = d.open && d.attorney && x.status === "pending_review";

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
        {x.status === "approved" && <CopyButton text={x.body} />}
      </div>
      <p className="text-xs text-slate-500">
        Asked by {d.names[x.requested_by] ?? "?"}, {formatDateTime(x.created_at)} · template version {x.template_version} · {x.model}
        {x.reviewed_at && (
          <>
            {" "}
            · reviewed by {d.names[x.reviewed_by] ?? "?"}, {formatDateTime(x.reviewed_at)}
          </>
        )}
      </p>
      {x.inputs && (
        <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">What staff gave the AI</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {((x.inputs.issues ?? x.inputs.facts ?? []) as string[]).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}
      {x.review_note && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Attorney&apos;s note: {x.review_note}</p>}

      {editable ? (
        <form action={saveDraft} className="space-y-2">
          <Hidden values={{ back: d.back, draft_id: x.id }} />
          <textarea key={x.updated_at} name="body" required rows={letterRows(x.body)} defaultValue={x.body} aria-label={`${title} text`} className={letterBoxClass} />
          <Button>Save changes</Button>
        </form>
      ) : (
        <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800">{x.body}</div>
      )}

      {x.body !== x.original_body && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">Show the first text</summary>
          <div className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">{x.original_body}</div>
        </details>
      )}

      {reviewable && (
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          <form action={reviewDraft}>
            <Hidden values={{ back: d.back, draft_id: x.id, decision: "approved" }} />
            <ConfirmButton confirm={`Approve this ${title.toLowerCase()}?\n\nSave any edits first. This approval is permanent and is logged with your name and the time.`}>
              <Icon name="check" /> Approve
            </ConfirmButton>
          </form>
          <form action={reviewDraft} className="flex flex-wrap items-end gap-2">
            <Hidden values={{ back: d.back, draft_id: x.id }} />
            <Field label="Or">
              <select name="decision" className={inputClass}>
                <option value="changes_requested">Send back</option>
                <option value="rejected">Reject</option>
              </select>
            </Field>
            <Field label="Note">
              <input name="note" required className={`${inputClass} w-56`} />
            </Field>
            <Button>Save</Button>
          </form>
        </div>
      )}
    </li>
  );
}
