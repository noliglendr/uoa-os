import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge, Button, ErrorBanner, Hidden, Loading, PageHeader, letterBoxClass, letterRows } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Disclosure } from "@/components/disclosure";
import { isAttorney, requireStaff } from "@/lib/session";
import { formatDateTime } from "@/lib/labels";
import { approveTemplate, saveTemplate } from "../actions";

export const metadata: Metadata = { title: "Templates" };

// The attorney approves each template once. New wording needs a new approval
// (the database withdraws the approval when the wording changes).
export default function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  return (
    <>
      <PageHeader
        eyebrow="Firm"
        icon="mail"
        title="Templates"
        description="Wording for letters and client messages. The attorney approves each one."
      />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Templates />
      </Suspense>
    </>
  );
}

type Table = "draft_templates" | "message_templates";
type Row = { kind: string; label: string; body: string; version: number; attorney_approved: boolean; approved_by: string | null; approved_at: string | null };

const GROUPS: Record<Table, string> = {
  draft_templates: "Letters (used by AI drafts)",
  message_templates: "Client messages (used by the Client outbox)",
};

/** One plain line per template: when UOA OS uses it. */
const USED_FOR: Record<string, string> = {
  cover_letter: "Sent with a filing to the agency.",
  evidence_request: "Asks the client for the documents on the checklist.",
  closing_letter: "Sent when the matter closes.",
  response_outline: "Outline for an RFE or NOID response.",
  statement_draft: "First draft of a statement (declaration).",
  receipt_update: "Tells the client a receipt notice arrived.",
  appointment_update: "Tells the client about a biometrics or interview appointment.",
  engagement_followup: "Reminds the client to sign the engagement.",
  documents_followup: "Reminds the client about documents still missing.",
  documents_request: "Email with the client's upload link (made on a matter's Evidence tab).",
};

/** Blanks UOA OS fills in by itself. Every other [BLANK] is filled by staff. */
const AUTO = new Set([
  "DATE", "ATTORNEY NAME", "ITEM LIST", "FORM TYPE", "APPOINTMENT TYPE", "APPOINTMENT DATE",
  "UPLOAD LINK", "LINK EXPIRES", "DUE DATE", "NOTICE TYPE", "RESPONSE DUE", "EXHIBIT LIST",
]);

const CHIP = {
  auto: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  staff: "bg-amber-100 text-amber-900 ring-amber-200",
  ai: "bg-sky-100 text-sky-900 ring-sky-200",
};

function chipKind(token: string): keyof typeof CHIP {
  if (token.startsWith("{{")) return "ai";
  return AUTO.has(token.slice(1, -1)) ? "auto" : "staff";
}

/** The template text with each blank shown as a coloured chip. */
function Preview({ body }: { body: string }) {
  const parts = body.split(/(\[[^\]\n]+\]|\{\{[^}\n]+\}\})/g);
  return (
    <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800">
      {parts.map((p, n) =>
        n % 2 === 1 ? (
          <span key={n} className={`rounded px-1 py-0.5 text-[0.8rem] font-medium ring-1 ${CHIP[chipKind(p)]}`}>
            {p.startsWith("{{") ? `AI: ${p.slice(2, -2).trim()}` : p.slice(1, -1)}
          </span>
        ) : (
          p
        ),
      )}
    </div>
  );
}

async function Templates() {
  const { supabase, staff } = await requireStaff();
  const [letters, messages, { data: people }] = await Promise.all([
    supabase.from("draft_templates").select("*").order("kind"),
    supabase.from("message_templates").select("*").order("kind"),
    supabase.rpc("staff_names", {}, { get: true }),
  ]);
  if (letters.error) throw new Error(letters.error.message);
  const attorney = isAttorney(staff);
  const names = (people ?? {}) as Record<string, string>;
  const groups: { table: Table; rows: Row[] }[] = [
    { table: "draft_templates", rows: letters.data as Row[] },
    ...(messages.error ? [] : [{ table: "message_templates" as const, rows: messages.data as Row[] }]),
  ];
  const all = groups.flatMap((g) => g.rows);
  const waiting = all.filter((t) => !t.attorney_approved);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <p className="font-medium text-slate-900">
          {waiting.length === 0 ? "All templates are approved." : `${waiting.length} of ${all.length} templates need the attorney's approval.`}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          Blanks:
          <span className={`rounded px-1.5 py-0.5 ring-1 ${CHIP.auto}`}>UOA OS fills in</span>
          <span className={`rounded px-1.5 py-0.5 ring-1 ${CHIP.staff}`}>staff fill in (client details)</span>
          <span className={`rounded px-1.5 py-0.5 ring-1 ${CHIP.ai}`}>AI writes</span>
        </p>
      </div>

      {groups.map(({ table, rows }) => (
        <section key={table} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900">{GROUPS[table]}</h2>
          <ul className="divide-y divide-slate-100">
            {rows.map((t) => (
              <li key={t.kind}>
                <Disclosure
                  summary={
                    <>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">{t.label}</span>
                      <span className="block text-xs text-slate-500">{USED_FOR[t.kind] ?? ""}</span>
                    </span>
                    {t.attorney_approved ? <Badge tone="green">Approved</Badge> : <Badge tone="amber">Needs approval</Badge>}
                    </>
                  }
                >
                  <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                    <Preview body={t.body} />
                    <p className="text-xs text-slate-500">
                      Version {t.version}
                      {t.approved_at && ` · approved by ${names[t.approved_by ?? ""] ?? "?"}, ${formatDateTime(t.approved_at)}`}
                    </p>

                    {attorney && (
                      <div className="flex flex-wrap items-start gap-3">
                        <form action={approveTemplate}>
                          <Hidden values={{ back: "/templates", table, kind: t.kind, value: String(!t.attorney_approved) }} />
                          <ConfirmButton
                            variant={t.attorney_approved ? "secondary" : "primary"}
                            confirm={
                              t.attorney_approved
                                ? `Withdraw approval of the ${t.label.toLowerCase()}? Nothing new is prepared from it.`
                                : `Approve this wording of the ${t.label.toLowerCase()}?\n\nThis is logged with your name and the time.`
                            }
                          >
                            {t.attorney_approved ? "Withdraw approval" : "Approve"}
                          </ConfirmButton>
                        </form>
                        <div className="min-w-0 flex-1">
                          <Disclosure
                            chevron={false}
                            buttonClassName="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            summary="Change wording"
                          >
                          <form action={saveTemplate} className="mt-3 space-y-2">
                            <Hidden values={{ back: "/templates", table, kind: t.kind }} />
                            <textarea key={t.version} name="body" required rows={letterRows(t.body)} defaultValue={t.body} aria-label={`${t.label} wording`} className={letterBoxClass} />
                            <p className="text-xs text-slate-500">
                              Keep client details as [BLANKS]. Saving removes the approval: approve it again after.
                            </p>
                            <Button>Save wording</Button>
                          </form>
                          </Disclosure>
                        </div>
                      </div>
                    )}
                  </div>
                </Disclosure>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
