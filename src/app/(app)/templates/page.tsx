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
        title="Letter templates"
        description="AI drafts follow these letters. No draft is made until the attorney approves its template, and changing the wording needs a new approval. Keep client details as blanks in [SQUARE BRACKETS]; UOA OS fills [DATE] with today's date, [ATTORNEY NAME] with the matter's attorney and [ITEM LIST] from the checklist."
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

async function Templates() {
  const { supabase, staff } = await requireStaff();
  const [{ data, error }, { data: people }] = await Promise.all([
    supabase.from("draft_templates").select("*").order("kind"),
    supabase.rpc("staff_names", {}, { get: true }),
  ]);
  if (error) throw new Error(error.message);
  const attorney = isAttorney(staff);
  const names = (people ?? {}) as Record<string, string>;

  return (
    <>
      {data.map((t) => (
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
                <Hidden values={{ back: "/templates", kind: t.kind }} />
                <textarea name="body" required rows={letterRows(t.body)} defaultValue={t.body} aria-label={`${t.label} wording`} className={letterBoxClass} />
                <Button>Save wording</Button>
              </form>
              <form action={approveTemplate}>
                <Hidden values={{ back: "/templates", kind: t.kind, value: String(!t.attorney_approved) }} />
                <ConfirmButton
                  variant={t.attorney_approved ? "secondary" : "primary"}
                  confirm={t.attorney_approved ? `Withdraw approval of the ${t.label.toLowerCase()}? No new drafts can use it.` : `Approve the saved wording of the ${t.label.toLowerCase()}?\n\nThis is logged with your name and the time.`}
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
    </>
  );
}
