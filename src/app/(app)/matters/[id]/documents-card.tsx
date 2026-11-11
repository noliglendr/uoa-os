import Link from "next/link";
import { Badge, Button, Card, Empty, Hidden, inputClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { buttonClass } from "@/components/styles";
import { addDays, today } from "@/lib/deadlines";
import { nowIso } from "@/lib/documents";
import { DOCUMENT_STATUS, formatDate, formatDateTime, label } from "@/lib/labels";
import { cancelDocRequest, reviewDocument } from "../../actions";
import type { MatterData } from "./sections";
import { RequestForm } from "./request-form";

// Client documents (Increment 2; decision #31): secure upload links, uploads
// and their review. Attorney, principal and paralegal open files (D16).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const TYPE_NAME: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/heic": "HEIC" };

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function DocumentsCard({ d }: { d: MatterData }) {
  const now = nowIso();
  const requests = d.docRequests;
  const docs = d.documents;
  const labelOf = new Map(d.checklist.map((i) => [i.id, i.label]));
  const eligible = d.checklist.filter((i) => (i.owner === "client" || i.owner === "third_party") && ["needed", "requested"].includes(i.status));
  const state = (r: Row) => (r.status !== "open" ? r.status : r.expires_at <= now ? "expired" : "open");
  const STATE_LABEL: Record<string, [string, "green" | "gray" | "red" | "amber"]> = {
    open: ["Open", "green"],
    expired: ["Expired", "gray"],
    cancelled: ["Cancelled", "gray"],
    locked: ["Locked: too many wrong codes", "red"],
  };

  return (
    <Card
      title="Client documents"
      description="Secure upload links for the client. Test with made-up files only until real documents are approved (D17)."
      actions={
        d.canDocs && docs.length > 0 ? (
          <a href={`/matters/${d.matter.id}/documents-zip`} className={buttonClass("secondary")}>
            Download all (ZIP)
          </a>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {d.canDocs && d.open && (
          d.docTemplateApproved ? (
            <RequestForm
              matterId={d.matter.id}
              items={eligible.map((i) => ({ id: i.id, label: i.label, owner: i.owner }))}
              parties={d.parties.map((p) => ({ id: p.id, label: p.label }))}
              defaultDue={addDays(today(), 7)}
            />
          ) : (
            <p className="rounded-lg border border-gold-300 bg-gold-100/50 px-4 py-3 text-sm text-slate-700">
              The attorney must approve the “Request: upload documents” template on the{" "}
              <Link href="/templates" className="font-medium text-navy-700 hover:underline">
                Templates
              </Link>{" "}
              page before upload links can be made.
            </p>
          )
        )}

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Upload links</h3>
          {requests.length === 0 ? (
            <Empty>No upload links yet.</Empty>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {requests.map((r) => {
                const s = state(r);
                return (
                  <li key={r.id} className="space-y-1.5 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATE_LABEL[s][1]}>{STATE_LABEL[s][0]}</Badge>
                      <span className="text-slate-900">Due {formatDate(r.due_date)}</span>
                      <span className="text-xs text-slate-500">
                        Made {formatDateTime(r.created_at)} by {d.names[r.created_by] ?? "?"} · link works until {formatDateTime(r.expires_at)}
                        {r.last_opened_at ? ` · client opened it ${formatDateTime(r.last_opened_at)}` : " · not opened yet"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{(r.items as Row[]).map((x) => labelOf.get(x.item_id) ?? "?").join(", ")}</p>
                    {r.cancel_reason && <p className="text-xs text-slate-500">Cancelled: {r.cancel_reason}</p>}
                    {d.canDocs && s === "open" && (
                      <form action={cancelDocRequest} className="flex flex-wrap items-center gap-2">
                        <Hidden values={{ back: d.back, request_id: r.id }} />
                        <input name="reason" required placeholder="Why cancel it?" aria-label="Reason for cancelling" className={`${inputClass} w-48`} />
                        <ConfirmButton variant="secondary" confirm="Cancel this upload link? The client can no longer use it.">
                          Cancel link
                        </ConfirmButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Received files</h3>
          {docs.length === 0 ? (
            <Empty>No files yet.</Empty>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {docs.map((x) => {
                const n = docs.filter((y) => y.item_id === x.item_id && y.created_at <= x.created_at).length;
                return (
                  <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="text-slate-900">
                        {labelOf.get(x.item_id) ?? "?"} ({n})
                      </span>
                      <span className="block text-xs text-slate-500">
                        {TYPE_NAME[x.mime]} · {size(x.size_bytes)} · {x.source === "client" ? "from the client" : `by ${d.names[x.uploaded_by] ?? "?"}`},{" "}
                        {formatDateTime(x.created_at)}
                        {x.reviewed_by && ` · ${label(DOCUMENT_STATUS, x.status).toLowerCase()} by ${d.names[x.reviewed_by] ?? "?"}`}
                        {x.reject_reason && `: ${x.reject_reason}`}
                      </span>
                    </span>
                    <Badge tone={x.status === "accepted" ? "green" : x.status === "rejected" ? "red" : "amber"}>{label(DOCUMENT_STATUS, x.status)}</Badge>
                    {d.canDocs && (
                      <a href={`/documents/${x.id}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
                        Open
                      </a>
                    )}
                    {d.canDocs && d.open && x.status === "received" && (
                      <>
                        <form action={reviewDocument}>
                          <Hidden values={{ back: d.back, document_id: x.id, decision: "accepted" }} />
                          <Button>Accept</Button>
                        </form>
                        <form action={reviewDocument} className="flex items-center gap-1.5">
                          <Hidden values={{ back: d.back, document_id: x.id, decision: "rejected" }} />
                          <input name="reason" required placeholder="Why? (client sees it)" aria-label="Reason for rejecting" className={`${inputClass} w-44`} />
                          <ConfirmButton variant="secondary" confirm="Reject this file? The client sees your reason and can upload it again.">
                            Reject
                          </ConfirmButton>
                        </form>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!d.canDocs && docs.length > 0 && <p className="mt-2 text-xs text-slate-500">Only the attorney, principal and paralegals open files (D16).</p>}
        </div>
      </div>
    </Card>
  );
}
