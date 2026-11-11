import { Suspense } from "react";
import { Badge, Button, Card, ErrorBanner, Hidden, Loading, PageHeader, letterBoxClass, letterRows } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { isAttorney, requireStaff } from "@/lib/session";
import { formatDateTime } from "@/lib/labels";
import { approveTemplate, saveTemplate } from "../actions";

// The attorney approves each letter template once. New wording needs a new approval.
export default function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  return (
    <>
      <PageHeader eyebrow="Firm · Decision D19" icon="mail"
        title="Templates"
        description="The attorney approves each template once, and changing the wording needs a new approval. Keep client details as blanks in [SQUARE BRACKETS]: staff fill them in outside UOA OS."
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

const GROUPS = {
  draft_templates: {
    title: "Letter templates (AI drafts)",
    note: "AI drafts follow these letters. No draft is made until the template is approved. UOA OS fills [DATE], [ATTORNEY NAME] and [ITEM LIST] (from the checklist).",
  },
  message_templates: {
    title: "Client message templates (Client outbox)",
    note: "UOA OS prepares these messages in the Client outbox: updates when a receipt is logged or a biometrics or interview appointment is set, and follow-ups when an engagement is not signed or documents are still missing. Nothing is prepared until the template is approved, and staff send every message themselves. UOA OS fills [DATE], [ATTORNEY NAME], [FORM TYPE], [APPOINTMENT TYPE], [APPOINTMENT DATE] and [ITEM LIST]. Decisions have no template: the attorney tells the client.",
  },
} as const;

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
  // Before the Outbox migration is applied, show the letter templates only.
  const groups = [
    { table: "draft_templates" as const, rows: letters.data },
    ...(messages.error ? [] : [{ table: "message_templates" as const, rows: messages.data }]),
  ];

  return groups.map(({ table, rows }) => (
    <section key={table} className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{GROUPS[table].title}</h2>
        <p className="mt-1 text-sm text-slate-500">{GROUPS[table].note}</p>
      </div>
      {rows.map((t) => (
        <Card
          key={t.kind}
          title={
            <>
              {t.label} {t.attorney_approved ? <Badge tone="green">Approved</Badge> : <Badge tone="amber">Not approved</Badge>}
            </>
          }
          description={`Version ${t.version}${t.approved_at ? ` · approved by ${names[t.approved_by] ?? "?"}, ${formatDateTime(t.approved_at)}` : ""}`}
        >
          {attorney ? (
            <div className="space-y-3">
              <form action={saveTemplate} className="space-y-2">
                <Hidden values={{ back: "/templates", table, kind: t.kind }} />
                <textarea name="body" required rows={letterRows(t.body)} defaultValue={t.body} aria-label={`${t.label} wording`} className={letterBoxClass} />
                <Button>Save wording</Button>
              </form>
              <form action={approveTemplate}>
                <Hidden values={{ back: "/templates", table, kind: t.kind, value: String(!t.attorney_approved) }} />
                <ConfirmButton
                  variant={t.attorney_approved ? "secondary" : "primary"}
                  confirm={t.attorney_approved ? `Withdraw approval of the ${t.label.toLowerCase()}? Nothing new is prepared from it.` : `Approve the saved wording of the ${t.label.toLowerCase()}?\n\nThis is logged with your name and the time.`}
                >
                  {t.attorney_approved ? "Withdraw approval" : "Approve template"}
                </ConfirmButton>
              </form>
            </div>
          ) : (
            <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800">{t.body}</div>
          )}
        </Card>
      ))}
    </section>
  ));
}
