import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Button, Card, Empty, ErrorBanner, Hidden, Loading, NotForYourRole, PageHeader, inputClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { requireStaff } from "@/lib/session";
import { addDays, today } from "@/lib/deadlines";
import { MESSAGE_KINDS, SENT_VIA, formatDateTime, label } from "@/lib/labels";
import { cancelMessage, checkClientFollowups, markMessageSent } from "../actions";
import { CopyButton } from "../matters/[id]/copy-button";

export const metadata: Metadata = { title: "Client outbox" };

// Client outbox (Increment 4, Steps 2-3): UOA OS prepares client updates and
// follow-ups from attorney-approved templates; staff send each one themselves
// and record it. Nothing is sent by UOA OS (D11), and decisions are never
// here: the attorney tells the client.
export default function OutboxPage({ searchParams }: PageProps<"/outbox">) {
  return (
    <>
      <PageHeader
        eyebrow="Work · Automation"
        icon="send"
        title="Client outbox"
        description="Client updates and follow-ups that UOA OS prepared from the attorney's approved templates. Copy each message, add the client's name, send it yourself, then click “Mark sent”. UOA OS never sends anything to a client."
      />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Outbox />
      </Suspense>
    </>
  );
}

const SENDERS = ["principal", "attorney", "paralegal", "docketing"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

async function Outbox() {
  const { supabase, staff } = await requireStaff();
  if (!staff || !SENDERS.includes(staff.role)) return <NotForYourRole who="the attorney, paralegals and docketing staff" />;

  const since = addDays(today(), -30);
  const [waiting, recent, templates, names] = await Promise.all([
    supabase.from("client_messages").select("*, matter:matters(id, code, summary)").eq("status", "waiting").order("created_at"),
    supabase
      .from("client_messages")
      .select("id, kind, status, sent_via, sent_by, sent_at, cancel_reason, cancelled_by, cancelled_at, matter:matters(id, code)")
      .neq("status", "waiting")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase.from("message_templates").select("kind, label, attorney_approved").order("kind"),
    supabase.rpc("staff_names", {}, { get: true }),
  ]);
  for (const r of [waiting, recent, templates]) if (r.error) throw new Error(r.error.message);
  const who = (names.data ?? {}) as Record<string, string>;
  // The document request email is made on the matter page, not in the outbox.
  const off = (templates.data ?? []).filter((t) => !t.attorney_approved && t.kind !== "documents_request");
  const waitingRows = waiting.data as Row[];
  const doneRows = recent.data as Row[];

  return (
    <>
      {off.length > 0 && (
        <p className="rounded-lg border border-gold-300 bg-gold-100/50 px-4 py-3 text-sm text-slate-700">
          <strong>Not prepared yet:</strong> {off.map((t) => t.label).join(", ")}. The attorney must approve{" "}
          {off.length === 1 ? "this template" : "these templates"} on the{" "}
          <Link href="/templates" className="font-medium text-navy-700 hover:underline">
            Templates
          </Link>{" "}
          page first.
        </p>
      )}

      <Card
        title={`Waiting to be sent (${waitingRows.length})`}
        description="Oldest first. Fill in [CLIENT NAME] and any other blank when you send it."
        actions={
          <form action={checkClientFollowups}>
            <Hidden values={{ back: "/outbox" }} />
            <Button>
              <Icon name="refresh" /> Check for follow-ups now
            </Button>
          </form>
        }
        flush
      >
        {waitingRows.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-sm text-emerald-700">
            <Icon name="check" className="h-5 w-5" /> Nothing waiting. New messages appear here when a receipt is logged, an appointment is set, or a client follow-up is due.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {waitingRows.map((m) => (
              <li key={m.id} className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/matters/${m.matter.id}`} className="font-semibold text-navy-800 hover:underline">
                    {m.matter.code}
                  </Link>
                  <Badge tone={m.kind.endsWith("followup") ? "amber" : "blue"}>{label(MESSAGE_KINDS, m.kind)}</Badge>
                  <span className="text-xs text-slate-500">Prepared {formatDateTime(m.created_at)}</span>
                </div>
                <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800">{m.body}</div>
                <div className="flex flex-wrap items-end gap-3">
                  <CopyButton text={m.body} />
                  <form action={markMessageSent} className="flex flex-wrap items-end gap-2">
                    <Hidden values={{ back: "/outbox", message_id: m.id }} />
                    <select name="via" required defaultValue="" aria-label="How it was sent" className={inputClass}>
                      <option value="" disabled>
                        How did you send it?
                      </option>
                      {Object.entries(SENT_VIA).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <ConfirmButton confirm={`${m.matter.code}: did you send this message to the client yourself?\n\nThis is logged with your name and the time.`}>
                      <Icon name="check" /> Mark sent
                    </ConfirmButton>
                  </form>
                  <form action={cancelMessage} className="flex flex-wrap items-end gap-2">
                    <Hidden values={{ back: "/outbox", message_id: m.id }} />
                    <input name="reason" required placeholder="Why not send it?" aria-label="Reason for not sending" className={`${inputClass} w-48`} />
                    <ConfirmButton variant="secondary" confirm={`${m.matter.code}: don't send this message? It is kept in the record as cancelled.`}>
                      Don&apos;t send
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Sent or cancelled (last 30 days)" flush>
        {doneRows.length === 0 ? (
          <div className="p-4">
            <Empty>Nothing yet.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {doneRows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <Link href={`/matters/${m.matter.id}`} className="w-20 font-semibold text-navy-800 hover:underline">
                  {m.matter.code}
                </Link>
                <span className="min-w-0 flex-1 text-slate-900">{label(MESSAGE_KINDS, m.kind)}</span>
                {m.status === "sent" ? (
                  <span className="text-xs text-slate-500">
                    <Badge tone="green">Sent</Badge> {label(SENT_VIA, m.sent_via)} by {who[m.sent_by] ?? "?"}, {formatDateTime(m.sent_at)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    <Badge tone="gray">Cancelled</Badge> {m.cancel_reason} ({m.cancelled_by ? (who[m.cancelled_by] ?? "?") : "UOA OS"}, {formatDateTime(m.cancelled_at)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
