import Link from "next/link";
import { Suspense } from "react";
import { Badge, Button, Card, Empty, ErrorBanner, Hidden, Loading, NotForYourRole, PageHeader, inputClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { isAttorney, requireStaff } from "@/lib/session";
import { FEE_TRIGGERS, INVOICE_STATUS, MATTER_TYPES, formatDateTime, formatMoney, label } from "@/lib/labels";
import { addFeePhase, approveInvoice, recordInvoiceSent, saveFeePhase, setInvoiceAmount, voidInvoice } from "../actions";

// Invoices (Increment 4, Step 4): reaching a fee phase prepares an invoice
// draft; the attorney sets the amount and approves; staff enter it in the
// billing tool (D22), which sends and collects, and record its number here.
export default function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  return (
    <>
      <PageHeader
        eyebrow="Work · Automation · D22, D23"
        icon="invoice"
        title="Invoices"
        description="When a matter reaches a fee phase, UOA OS prepares an invoice draft. The attorney checks the amount and approves it. Staff enter it in the billing tool, which sends it and collects payment, and record the tool's invoice number here."
      />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Invoices />
      </Suspense>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

async function Invoices() {
  const { supabase, staff } = await requireStaff();
  if (!staff || !["principal", "attorney", "administrator"].includes(staff.role)) {
    return <NotForYourRole who="the attorney, the principal and administrators" />;
  }
  const attorney = isAttorney(staff);
  const principal = staff.role === "principal";

  const [invoices, schedule, names, setting] = await Promise.all([
    supabase.from("invoices").select("*, matter:matters(id, code, summary, matter_type)").order("created_at", { ascending: false }).limit(200),
    supabase.from("fee_schedule").select("*").order("matter_type").order("trigger").order("label"),
    supabase.rpc("staff_names", {}, { get: true }),
    supabase.from("settings").select("value").eq("key", "billing.invoice_drafts").maybeSingle(),
  ]);
  for (const r of [invoices, schedule]) if (r.error) throw new Error(r.error.message);
  const who = (names.data ?? {}) as Record<string, string>;
  const all = invoices.data as Row[];
  const drafts = all.filter((i) => i.status === "draft");
  const approved = all.filter((i) => i.status === "approved");
  const done = all.filter((i) => i.status === "sent" || i.status === "void");
  const on = setting.data?.value !== false;

  const head = (i: Row) => (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/matters/${i.matter.id}`} className="font-semibold text-navy-800 hover:underline">
        {i.matter.code}
      </Link>
      <span className="text-sm text-slate-900">{i.label}</span>
      <span className="text-xs text-slate-500">
        {label(MATTER_TYPES, i.matter.matter_type)} · prepared {formatDateTime(i.created_at)}
      </span>
    </div>
  );

  return (
    <>
      {!on && (
        <p className="rounded-lg border border-gold-300 bg-gold-100/50 px-4 py-3 text-sm text-slate-700">
          Invoice drafts are <strong>off</strong> (Settings → “Prepare invoice drafts”). No new drafts are prepared.
        </p>
      )}

      <Card title={`Drafts to approve (${drafts.length})`} description={attorney ? "Check the amount, then approve. Approval is logged with your name." : "Only the attorney sets amounts and approves."} flush>
        {drafts.length === 0 ? (
          <div className="p-4">
            <Empty>No drafts. A draft appears when a matter reaches a fee phase in the fee schedule below.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {drafts.map((i) => (
              <li key={i.id} className="space-y-2 px-4 py-3">
                {head(i)}
                {attorney ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <form action={setInvoiceAmount} className="flex flex-wrap items-end gap-2">
                      <Hidden values={{ back: "/invoices", invoice_id: i.id }} />
                      <label className="flex items-center gap-1 text-sm text-slate-600">
                        $
                        <input name="amount" required inputMode="decimal" defaultValue={i.amount_cents != null ? (i.amount_cents / 100).toFixed(2) : ""} placeholder="Amount" aria-label="Amount in dollars" className={`${inputClass} w-32`} />
                      </label>
                      <input name="note" defaultValue={i.note ?? ""} placeholder="Note (optional)" aria-label="Note" className={`${inputClass} w-48`} />
                      <Button>Save amount</Button>
                    </form>
                    <form action={approveInvoice}>
                      <Hidden values={{ back: "/invoices", invoice_id: i.id }} />
                      <ConfirmButton disabled={i.amount_cents == null} confirm={`${i.matter.code}: approve ${i.label} for ${formatMoney(i.amount_cents)}?\n\nThis is logged with your name and the time.`}>
                        <Icon name="check" /> Approve {formatMoney(i.amount_cents)}
                      </ConfirmButton>
                    </form>
                    <VoidForm id={i.id} code={i.matter.code} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">{i.amount_cents != null ? formatMoney(i.amount_cents) : "No amount yet"} · waiting for the attorney</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Approved: enter in the billing tool (${approved.length})`} description="Enter each invoice in the billing tool (it sends and collects), then record the tool's invoice number." flush>
        {approved.length === 0 ? (
          <div className="p-4">
            <Empty>Nothing waiting.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {approved.map((i) => (
              <li key={i.id} className="space-y-2 px-4 py-3">
                {head(i)}
                <p className="text-sm text-slate-700">
                  <strong>{formatMoney(i.amount_cents)}</strong> · approved by {who[i.approved_by] ?? "?"}, {formatDateTime(i.approved_at)}
                  {i.note && <> · {i.note}</>}
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <form action={recordInvoiceSent} className="flex flex-wrap items-end gap-2">
                    <Hidden values={{ back: "/invoices", invoice_id: i.id }} />
                    <input name="billing_ref" required placeholder="Billing tool invoice no." aria-label="Billing tool invoice number" className={`${inputClass} w-52`} />
                    <ConfirmButton confirm={`${i.matter.code}: did you enter this invoice in the billing tool?`}>Record as entered</ConfirmButton>
                  </form>
                  {attorney && <VoidForm id={i.id} code={i.matter.code} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Done (in the billing tool, or void)" flush>
        {done.length === 0 ? (
          <div className="p-4">
            <Empty>Nothing yet.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {done.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <Link href={`/matters/${i.matter.id}`} className="w-20 font-semibold text-navy-800 hover:underline">
                  {i.matter.code}
                </Link>
                <span className="min-w-0 flex-1 text-slate-900">
                  {i.label} · {formatMoney(i.amount_cents)}
                </span>
                {i.status === "sent" ? (
                  <span className="text-xs text-slate-500">
                    <Badge tone="green">{INVOICE_STATUS.sent}</Badge> no. {i.billing_ref}, {formatDateTime(i.sent_at)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    <Badge tone="gray">Void</Badge> {i.void_reason} ({who[i.voided_by] ?? "?"})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FeeSchedule rows={schedule.data as Row[]} principal={principal} />
    </>
  );
}

function VoidForm({ id, code }: { id: string; code: string }) {
  return (
    <form action={voidInvoice} className="flex flex-wrap items-end gap-2">
      <Hidden values={{ back: "/invoices", invoice_id: id }} />
      <input name="reason" required placeholder="Why void it?" aria-label="Reason for voiding" className={`${inputClass} w-40`} />
      <ConfirmButton variant="secondary" confirm={`${code}: void this invoice? It stays in the record as void.`}>
        Void
      </ConfirmButton>
    </form>
  );
}

function FeeSchedule({ rows, principal }: { rows: Row[]; principal: boolean }) {
  return (
    <Card
      title="Fee schedule (D23)"
      description="Which steps prepare an invoice draft, per matter type. Leave the amount empty to have the attorney enter it on each invoice. Only the principal changes the schedule; every change is logged."
      flush
    >
      <ul className="divide-y divide-slate-100">
        {Object.entries(MATTER_TYPES).map(([type, typeLabel]) => (
          <li key={type} className="space-y-2 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">{typeLabel}</h3>
            {rows
              .filter((r) => r.matter_type === type)
              .map((r) =>
                principal ? (
                  <form key={r.id} action={saveFeePhase} className="flex flex-wrap items-center gap-2 text-sm">
                    <Hidden values={{ back: "/invoices", phase_id: r.id }} />
                    <span className="w-56 text-slate-600">{label(FEE_TRIGGERS, r.trigger)}</span>
                    <input name="label" required defaultValue={r.label} aria-label="Fee phase name" className={`${inputClass} w-44`} />
                    <label className="flex items-center gap-1 text-slate-600">
                      $
                      <input name="amount" inputMode="decimal" defaultValue={r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : ""} placeholder="Set per invoice" aria-label="Amount in dollars" className={`${inputClass} w-32`} />
                    </label>
                    <select name="active" defaultValue={String(r.active)} aria-label="On or off" className={inputClass}>
                      <option value="true">On</option>
                      <option value="false">Off</option>
                    </select>
                    <Button>Save</Button>
                  </form>
                ) : (
                  <p key={r.id} className="text-sm text-slate-700">
                    {label(FEE_TRIGGERS, r.trigger)}: <strong>{r.label}</strong>, {r.amount_cents != null ? formatMoney(r.amount_cents) : "amount set per invoice"}
                    {!r.active && <Badge tone="gray">Off</Badge>}
                  </p>
                ),
              )}
          </li>
        ))}
      </ul>
      {principal && (
        <form action={addFeePhase} className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
          <Hidden values={{ back: "/invoices" }} />
          <span className="font-medium text-slate-700">Add a fee phase:</span>
          <select name="matter_type" required aria-label="Matter type" className={inputClass}>
            {Object.entries(MATTER_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select name="trigger" required aria-label="When" className={inputClass}>
            {Object.entries(FEE_TRIGGERS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input name="label" required placeholder="Name, e.g. RFE response fee" aria-label="Fee phase name" className={`${inputClass} w-52`} />
          <label className="flex items-center gap-1 text-slate-600">
            $
            <input name="amount" inputMode="decimal" placeholder="Set per invoice" aria-label="Amount in dollars" className={`${inputClass} w-32`} />
          </label>
          <Button>Add</Button>
        </form>
      )}
    </Card>
  );
}
