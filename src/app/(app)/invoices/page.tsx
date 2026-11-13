import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Badge, Button, ErrorBanner, Hidden, Loading, NotForYourRole, PageHeader, inputClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icons";
import { filterHref } from "@/components/filter-chips";
import { InvoiceTabs, type Tab } from "./invoice-tabs";
import { isAttorney, requireStaff } from "@/lib/session";
import { today } from "@/lib/deadlines";
import { FEE_TRIGGERS, MATTER_TYPES, formatDateTime, formatMoney, label } from "@/lib/labels";
import { addFeePhase, approveInvoice, recordInvoiceSent, saveFeePhase, setInvoiceAmount, voidInvoice } from "../actions";

export const metadata: Metadata = { title: "Invoices" };

// Invoices (Increment 4, Step 4): reaching a fee phase prepares an invoice
// draft; the attorney sets the amount and approves; staff enter it in the
// billing tool (D22), which sends and collects, and record its number here.
export default function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  return (
    <>
      <PageHeader eyebrow="Work" icon="invoice" title="Invoices" description="Approve the fee. Staff then enter it in the billing tool." />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Invoices searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const VIEWS = ["fees", "approve", "enter", "done"] as const;
type View = (typeof VIEWS)[number];

const sum = (rows: Row[]) => rows.reduce((t, i) => t + (i.amount_cents ?? 0), 0);

async function Invoices({ searchParams }: { searchParams: PageProps<"/invoices">["searchParams"] }) {
  const { supabase, staff } = await requireStaff();
  if (!staff || !["principal", "attorney", "administrator"].includes(staff.role)) {
    return <NotForYourRole who="the attorney, the principal and administrators" />;
  }
  const attorney = isAttorney(staff);
  const principal = staff.role === "principal";
  const raw = (await searchParams).view;

  const [invoices, schedule, names, setting] = await Promise.all([
    supabase.from("invoices").select("*, matter:matters(id, code, summary, matter_type)").order("created_at", { ascending: false }).limit(200),
    supabase.from("fee_schedule").select("*").order("matter_type").order("trigger").order("label"),
    supabase.rpc("staff_names", {}, { get: true }),
    supabase.from("settings").select("value").eq("key", "billing.invoice_drafts").maybeSingle(),
  ]);
  for (const r of [invoices, schedule]) if (r.error) throw new Error(r.error.message);
  const who = (names.data ?? {}) as Record<string, string>;
  const all = invoices.data as Row[];
  const drafts = all.filter((i) => i.status === "draft").reverse(); // oldest first
  const approved = all.filter((i) => i.status === "approved").reverse();
  const done = all.filter((i) => i.status === "sent" || i.status === "void");
  // The fee schedule opens first (Noli, Nov 12); the cards show what waits elsewhere.
  const fallback: View = "fees";
  const view: View = typeof raw === "string" && (VIEWS as readonly string[]).includes(raw) ? (raw as View) : fallback;
  const backOf = (v: View) => filterHref("/invoices", { view: v }, { view: fallback });
  const month = today().slice(0, 7);
  const thisMonth = done.filter((i) => i.status === "sent" && String(i.sent_at ?? "").slice(0, 7) === month);
  const on = setting.data?.value !== false;
  const feesOn = (schedule.data as Row[]).filter((r) => r.active).length;

  const tabs: Tab[] = [
    { view: "fees", href: backOf("fees"), title: "Fee schedule", icon: "cog", count: feesOn, total: "fees on", tone: "border-l-navy-600" },
    { view: "approve", href: backOf("approve"), title: "To approve", icon: "check", count: drafts.length, total: drafts.some((i) => i.amount_cents == null) ? "Amount needed" : formatMoney(sum(drafts)), tone: "border-l-gold-400" },
    { view: "enter", href: backOf("enter"), title: "To enter in billing", icon: "invoice", count: approved.length, total: formatMoney(sum(approved)), tone: "border-l-sky-500" },
    { view: "done", href: backOf("done"), title: "Entered this month", icon: "chart", count: thisMonth.length, total: formatMoney(sum(thisMonth)), tone: "border-l-emerald-500" },
  ];

  return (
    <>
      {!on && (
        <p className="rounded-lg border border-gold-300 bg-gold-100/50 px-4 py-3 text-sm text-slate-700">
          New invoice drafts are <strong>off</strong>. Turn them on in Settings.
        </p>
      )}

      <InvoiceTabs
        tabs={tabs}
        initial={view}
        panels={{
          fees: <FeeSchedule rows={schedule.data as Row[]} principal={principal} back={backOf("fees")} />,
          approve: (
        <List rows={drafts} empty="Nothing to approve.">
          {(i) => (
            <Disclosure summary={<Summary i={i} note={i.amount_cents == null ? <Badge tone="gold">Amount needed</Badge> : null} />}>
              <Panel>
                {attorney ? (
                  <>
                    <form key={`${i.amount_cents}|${i.note}`} action={setInvoiceAmount} className="flex flex-wrap items-end gap-2">
                      <Hidden values={{ back: backOf("approve"), invoice_id: i.id }} />
                      <label className="flex items-center gap-1 text-sm text-slate-600">
                        $
                        <input name="amount" required inputMode="decimal" defaultValue={i.amount_cents != null ? (i.amount_cents / 100).toFixed(2) : ""} placeholder="Amount" aria-label="Amount in dollars" className={`${inputClass} w-32`} />
                      </label>
                      <input name="note" defaultValue={i.note ?? ""} placeholder="Note (optional)" aria-label="Note" className={`${inputClass} w-56`} />
                      <Button variant="secondary">Save</Button>
                    </form>
                    <div className="flex flex-wrap items-center gap-3">
                      <form action={approveInvoice}>
                        <Hidden values={{ back: backOf("approve"), invoice_id: i.id }} />
                        <ConfirmButton variant="primary" disabled={i.amount_cents == null} confirm={`${i.matter.code}: approve ${i.label} for ${formatMoney(i.amount_cents)}?\n\nThis is logged with your name and the time.`}>
                          <Icon name="check" /> {i.amount_cents == null ? "Save an amount first" : `Approve ${formatMoney(i.amount_cents)}`}
                        </ConfirmButton>
                      </form>
                      <VoidForm id={i.id} code={i.matter.code} back={backOf("approve")} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-600">Waiting for the attorney.</p>
                )}
              </Panel>
            </Disclosure>
          )}
        </List>
          ),
          enter: (
        <List rows={approved} empty="Nothing to enter.">
          {(i) => (
            <Disclosure summary={<Summary i={i} note={<span className="text-xs text-slate-500">Approved by {who[i.approved_by] ?? "?"}</span>} />}>
              <Panel>
                {i.note && <p className="text-sm text-slate-700">Note: {i.note}</p>}
                <form action={recordInvoiceSent} className="flex flex-wrap items-end gap-2">
                  <Hidden values={{ back: backOf("enter"), invoice_id: i.id }} />
                  <input name="billing_ref" required placeholder="Billing tool invoice no." aria-label="Billing tool invoice number" className={`${inputClass} w-56`} />
                  <ConfirmButton variant="primary" confirm={`${i.matter.code}: did you enter this invoice in the billing tool?`}>
                    <Icon name="check" /> Mark entered
                  </ConfirmButton>
                </form>
                {attorney && <VoidForm id={i.id} code={i.matter.code} back={backOf("enter")} />}
              </Panel>
            </Disclosure>
          )}
        </List>
          ),
          done: (
        <List rows={done} empty="Nothing yet.">
          {(i) => (
            <div className="px-4 py-3 sm:pl-11">
              <Summary
                i={i}
                note={
                  i.status === "sent" ? (
                    <span className="text-xs text-slate-500">
                      <Badge tone="green">Entered</Badge> no. {i.billing_ref}, {formatDateTime(i.sent_at)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      <Badge tone="gray">Void</Badge> {i.void_reason}
                    </span>
                  )
                }
              />
            </div>
          )}
        </List>
          ),
        }}
      />
    </>
  );
}

function List({ rows, empty, children }: { rows: Row[]; empty: string; children: (i: Row) => ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {rows.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-emerald-700">
          <Icon name="check" className="h-5 w-5" /> {empty}
        </div>
      ) : (
        <ul className="stagger divide-y divide-slate-100">
          {rows.map((i) => (
            <li key={i.id}>{children(i)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One line: matter, fee, extra note, amount on the right. */
function Summary({ i, note }: { i: Row; note?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
      <strong className="text-navy-800">{i.matter.code}</strong>
      <span className="text-sm text-slate-900">{i.label}</span>
      {note}
      <span className="ml-auto text-right">
        <span className="block font-semibold tabular-nums text-slate-900">{i.amount_cents != null ? formatMoney(i.amount_cents) : "—"}</span>
        <span className="block text-xs text-slate-500">{label(MATTER_TYPES, i.matter.matter_type)}</span>
      </span>
    </span>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:pl-11">{children}</div>;
}

function VoidForm({ id, code, back }: { id: string; code: string; back: string }) {
  return (
    <Disclosure chevron={false} buttonClassName="text-sm font-medium text-slate-500 hover:text-red-700 hover:underline" summary={<span>Void instead</span>}>
      <form action={voidInvoice} className="mt-2 flex flex-wrap items-end gap-2">
        <Hidden values={{ back, invoice_id: id }} />
        <input name="reason" required placeholder="Why void it?" aria-label="Reason for voiding" className={`${inputClass} w-56`} />
        <ConfirmButton variant="secondary" confirm={`${code}: void this invoice? It stays in the record as void.`}>
          Void
        </ConfirmButton>
      </form>
    </Disclosure>
  );
}

const segment =
  "cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium text-slate-600 transition has-[:checked]:bg-navy-800 has-[:checked]:text-white has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-300";
const fieldLabel = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

/** Fees by matter type: one card each. Click a fee to change it; add one at the bottom of a card. */
function FeeSchedule({ rows, principal, back }: { rows: Row[]; principal: boolean; back: string }) {
  const order = Object.keys(FEE_TRIGGERS);
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 px-1 text-sm text-slate-600">
        <Icon name="info" className="h-4 w-4 shrink-0 text-navy-600" />
        When a matter reaches the step, an invoice draft is prepared for approval.{principal && " Click a fee to change it."}
      </p>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {Object.entries(MATTER_TYPES).map(([type, typeLabel]) => {
          const mine = rows.filter((r) => r.matter_type === type).sort((a, b) => order.indexOf(a.trigger) - order.indexOf(b.trigger));
          const live = mine.filter((r) => r.active).length;
          return (
            <section key={type} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h2 className="font-semibold text-slate-900">{typeLabel}</h2>
                <span className="text-xs text-slate-500">{live === 1 ? "1 fee on" : `${live} fees on`}</span>
              </header>

              {mine.length === 0 ? (
                <p className="px-4 py-4 text-sm text-slate-500">No fees yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {mine.map((r) => {
                    const row = (
                      <span className={`flex min-w-0 flex-1 items-center gap-3 ${r.active ? "" : "opacity-60"}`}>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{r.label}</span>
                            {!r.active && <Badge tone="gray">Off</Badge>}
                          </span>
                          <span className="block text-xs text-slate-500">When: {label(FEE_TRIGGERS, r.trigger)}</span>
                        </span>
                        <span className={`shrink-0 text-right text-sm ${r.amount_cents != null ? "font-semibold tabular-nums text-slate-900" : "text-slate-500"}`}>
                          {r.amount_cents != null ? formatMoney(r.amount_cents) : "Set each time"}
                        </span>
                      </span>
                    );
                    return (
                      <li key={`${r.id}|${r.label}|${r.amount_cents}|${r.active}`}>
                        {principal ? (
                          <Disclosure summary={row}>
                            <form action={saveFeePhase} className="grid gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:grid-cols-[1fr_9rem_8rem] sm:items-end sm:pl-11">
                              <Hidden values={{ back, phase_id: r.id }} />
                              <label>
                                <span className={fieldLabel}>Fee name</span>
                                <input name="label" required defaultValue={r.label} className={`${inputClass} w-full`} />
                              </label>
                              <label>
                                <span className={fieldLabel}>Amount ($)</span>
                                <input name="amount" inputMode="decimal" defaultValue={r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : ""} placeholder="Set each time" className={`${inputClass} w-full`} />
                              </label>
                              <fieldset>
                                <legend className={fieldLabel}>Status</legend>
                                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                                  <label className={segment}>
                                    <input type="radio" name="active" value="true" defaultChecked={r.active} className="sr-only" />
                                    On
                                  </label>
                                  <label className={segment}>
                                    <input type="radio" name="active" value="false" defaultChecked={!r.active} className="sr-only" />
                                    Off
                                  </label>
                                </div>
                              </fieldset>
                              <div className="sm:col-span-3">
                                <Button>
                                  <Icon name="check" /> Save
                                </Button>
                              </div>
                            </form>
                          </Disclosure>
                        ) : (
                          <div className="flex px-4 py-3">{row}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {principal && (
                <div className="border-t border-slate-100">
                  <Disclosure
                    chevron={false}
                    buttonClassName="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-navy-700 hover:bg-slate-50"
                    summary={
                      <>
                        <Icon name="plus" className="h-4 w-4" /> Add a fee
                      </>
                    }
                  >
                    <form action={addFeePhase} className="grid gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:grid-cols-2">
                      <Hidden values={{ back, matter_type: type }} />
                      <label className="sm:col-span-2">
                        <span className={fieldLabel}>When</span>
                        <select name="trigger" required className={`${inputClass} w-full`}>
                          {Object.entries(FEE_TRIGGERS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={fieldLabel}>Fee name</span>
                        <input name="label" required placeholder="e.g. RFE response fee" className={`${inputClass} w-full`} />
                      </label>
                      <label>
                        <span className={fieldLabel}>Amount ($)</span>
                        <input name="amount" inputMode="decimal" placeholder="Set each time" className={`${inputClass} w-full`} />
                      </label>
                      <div className="sm:col-span-2">
                        <Button>
                          <Icon name="plus" /> Add fee
                        </Button>
                      </div>
                    </form>
                  </Disclosure>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
