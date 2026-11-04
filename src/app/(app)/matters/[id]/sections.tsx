import type { ReactNode } from "react";
import { Badge, Button, Card, Empty, Field, Hidden, Table, Td, inputClass } from "@/components/ui";
import { describeDue, today } from "@/lib/deadlines";
import {
  APPEARANCE_FORMS,
  CHANNELS,
  CHECKLIST_OWNERS,
  CHECKLIST_STATUS,
  CYCLE_KINDS,
  DECISIONS,
  FORM_FOR_FORUM,
  FORUMS,
  GATE_LABELS,
  NOTICE_TYPES,
  PARTY_ROLES,
  POST_DECISION,
  ROLE_LABELS,
  STAGES,
  formatDate,
  formatDateTime,
  label,
  stageName,
} from "@/lib/labels";
import {
  addAppearance,
  addChecklistItem,
  addDeadline,
  addFiling,
  addParty,
  advanceCycle,
  advanceStage,
  approveGate,
  clearConflict,
  closeMatter,
  completeTask,
  declineMatter,
  logNotice,
  openCycle,
  recordNoDeadline,
  setChecklistStatus,
  setMatterFlag,
  updateAppearance,
  updateDeadline,
  updateFiling,
} from "../../actions";

// Rows come from Supabase without generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
type Check = { item: string; ok: boolean };

export type MatterData = {
  matter: Row;
  attorney: boolean;
  checks: Check[];
  closure: Check[];
  gates: Row[];
  parties: Row[];
  appearances: Row[];
  filings: Row[];
  cycles: Row[];
  cycleChecks: Record<string, Check[]>;
  notices: Row[];
  deadlines: Row[];
  checklist: Row[];
  tasks: Row[];
  events: Row[];
  names: Record<string, string>;
  rules: Row[];
  back: string;
};

function Inline({ action, children, values }: { action: (f: FormData) => Promise<void>; values: Record<string, string | number | null | undefined>; children: ReactNode }) {
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-1.5">
      <Hidden values={values} />
      {children}
    </form>
  );
}

function AddForm({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="mt-3 rounded border border-dashed border-zinc-300 p-2 dark:border-zinc-700">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function Checks({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {checks.map((c) => (
        <li key={c.item} className="flex gap-2">
          <span className={c.ok ? "text-emerald-600" : "text-red-600"}>{c.ok ? "✓" : "✗"}</span>
          {c.item}
        </li>
      ))}
    </ul>
  );
}

function Options({ map, empty }: { map: Record<string, string>; empty?: string }) {
  return (
    <>
      {empty !== undefined && <option value="">{empty}</option>}
      {Object.entries(map).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </>
  );
}

function ruleOptions(rules: Row[]) {
  return Object.fromEntries(
    rules.map((r) => [r.code, `${r.code} ${r.label}${r.days ? ` (${r.days} days)` : " (date on notice)"}${r.attorney_verified ? "" : " – not verified"}`]),
  );
}

// ---------------------------------------------------------------------------
// Stage, exit gate and attorney approval
// ---------------------------------------------------------------------------

export function NextStepCard({ d }: { d: MatterData }) {
  const m = d.matter;
  const stage = STAGES.find((s) => s.n === m.stage)!;
  const gate = d.gates.find((g) => g.stage === m.stage && g.cycle_id === null);
  const isGateStage = [2, 3, 5, 6].includes(m.stage);
  const open = m.status === "prospect" || m.status === "active";
  const allOk = d.checks.length > 0 && d.checks.every((c) => c.ok);
  const clients = d.parties.filter((p) => p.is_client).length;
  const ids = { matter_id: m.id, back: d.back };

  return (
    <Card title={`Stage ${m.stage}: ${stage.name}`} actions={<span className="text-sm text-zinc-500">Owner: {stage.owner}</span>}>
      <ol className="mb-4 grid grid-cols-11 gap-1 text-center text-[10px] leading-tight">
        {STAGES.map((s) => (
          <li
            key={s.n}
            title={s.name}
            className={`rounded px-0.5 py-1 ${
              s.n < m.stage
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                : s.n === m.stage
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900"
            }`}
          >
            <div className="font-semibold">{s.n}</div>
            <div className="hidden sm:block">{s.name}</div>
          </li>
        ))}
      </ol>

      {m.status === "declined" && <p className="text-sm">Declined: {m.decline_reason}. Send the non-engagement letter.</p>}
      {m.status === "closed" && <p className="text-sm">Closed. History and export stay available.</p>}

      {open && m.stage < 10 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-medium">Exit gate: must be true to move to stage {m.stage + 1}</h3>
            <Checks checks={d.checks} />
          </div>
          <div className="space-y-3">
            {isGateStage &&
              (gate ? (
                <p className="text-sm">
                  <Badge tone="green">Approved</Badge> by {d.names[gate.approved_by] ?? "attorney"} on {formatDateTime(gate.approved_at)}
                  {gate.note && <span className="text-zinc-500">: {gate.note}</span>}
                </p>
              ) : d.attorney ? (
                <form action={approveGate} className="flex flex-wrap items-center gap-2">
                  <Hidden values={{ ...ids, stage: m.stage }} />
                  <input name="note" placeholder="Note (optional)" className={`${inputClass} flex-1`} />
                  <Button variant="primary">{GATE_LABELS[m.stage]}</Button>
                </form>
              ) : (
                <p className="text-sm">
                  <Badge tone="amber">Waiting for the attorney</Badge> {GATE_LABELS[m.stage]}
                </p>
              ))}
            {m.stage === 2 && clients > 1 && (
              <Inline action={setMatterFlag} values={{ ...ids, flag: "joint_consent", value: String(!m.joint_consent) }}>
                <Button>{m.joint_consent ? "Undo joint-representation consent" : "Record joint-representation consent"}</Button>
              </Inline>
            )}
            <Inline action={advanceStage} values={ids}>
              <Button variant="primary" disabled={!allOk}>
                Move to stage {m.stage + 1}: {stageName(m.stage + 1)}
              </Button>
            </Inline>
            {m.status === "prospect" && d.attorney && (
              <form action={declineMatter} className="flex flex-wrap gap-2">
                <Hidden values={ids} />
                <input name="reason" required placeholder="Reason for declining" className={`${inputClass} flex-1`} />
                <Button variant="danger">Decline matter</Button>
              </form>
            )}
          </div>
        </div>
      )}

      {open && m.stage === 10 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-medium">Closure checklist (R4)</h3>
            <Checks checks={d.closure} />
          </div>
          <div className="space-y-3">
            <Inline action={setMatterFlag} values={{ ...ids, flag: "closing_letter_sent", value: String(!m.closing_letter_sent) }}>
              <Button>{m.closing_letter_sent ? "Undo: closing letter sent" : "Record: closing letter sent"}</Button>
            </Inline>
            {d.attorney ? (
              <Inline action={closeMatter} values={ids}>
                <Button variant="primary" disabled={!d.closure.every((c) => c.ok)}>
                  Approve closure
                </Button>
              </Inline>
            ) : (
              <p className="text-sm text-zinc-500">The attorney approves closure.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

export function DeadlinesCard({ d }: { d: MatterData }) {
  const now = today();
  const ids = { matter_id: d.matter.id, back: d.back };
  const rows = d.deadlines.filter((x) => x.status === "open").concat(d.deadlines.filter((x) => x.status !== "open"));
  return (
    <Card title="Deadlines">
      {rows.length === 0 ? (
        <Empty>No deadlines.</Empty>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
          {rows.map((x) => (
            <li key={x.id} className={`py-2 ${x.status !== "open" ? "text-zinc-400" : ""}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <strong>{formatDate(x.due_date)}</strong>
                {x.status === "open" ? (
                  <Badge tone={x.due_date < now ? "red" : x.kind === "review" ? "red" : "gray"}>{describeDue(x.due_date, now)}</Badge>
                ) : (
                  <Badge>{x.status}</Badge>
                )}
                <span>{x.title}</span>
                {x.kind === "appointment" && <Badge tone="blue">Appointment</Badge>}
                {x.rule_code && <span className="text-xs text-zinc-500">rule {x.rule_code}</span>}
                {x.attorney_verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}
              </div>
              <div className="text-xs text-zinc-500">
                {x.raw_due_date && x.raw_due_date !== x.due_date && <>File by {formatDate(x.raw_due_date)} (weekend or holiday). </>}
                {x.mailing_extension && <>Includes mailing extension. </>}
                {x.attendee && <>Attends: {x.attendee}. </>}
                {x.prep_date && <>Prep by {formatDate(x.prep_date)}. </>}
                {x.reschedule_requested && <>Reschedule requested. </>}
              </div>
              {x.status === "open" && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.attorney && !x.attorney_verified && x.kind !== "review" && (
                    <Inline action={updateDeadline} values={{ back: d.back, deadline_id: x.id, field: "verify" }}>
                      <Button>Verify</Button>
                    </Inline>
                  )}
                  {x.kind !== "review" && (
                    <Inline action={updateDeadline} values={{ back: d.back, deadline_id: x.id, field: "met" }}>
                      <Button>{x.kind === "appointment" ? "Attended" : "Met"}</Button>
                    </Inline>
                  )}
                  {x.kind === "appointment" && !x.reschedule_requested && (
                    <Inline action={updateDeadline} values={{ back: d.back, deadline_id: x.id, field: "reschedule" }}>
                      <Button>Reschedule requested</Button>
                    </Inline>
                  )}
                  {d.attorney && x.kind !== "review" && (
                    <Inline action={updateDeadline} values={{ back: d.back, deadline_id: x.id, field: "cancelled" }}>
                      <Button variant="danger">Cancel</Button>
                    </Inline>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <AddForm title="Add a deadline">
        <form action={addDeadline} className="grid gap-2">
          <Hidden values={ids} />
          <DeadlineFields rules={d.rules} />
          <div>
            <Button variant="primary">Add deadline</Button>
          </div>
        </form>
      </AddForm>
    </Card>
  );
}

function DeadlineFields({ rules, compact }: { rules: Row[]; compact?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label="Rule">
        <select name="rule_code" className={inputClass}>
          <Options map={ruleOptions(rules)} empty={compact ? "No deadline / attorney review" : "No rule: enter the date"} />
        </select>
      </Field>
      <Field label="Title" hint="Defaults to the rule name">
        <input name="title" className={inputClass} />
      </Field>
      {!compact && (
        <Field label="Start date" hint="Notice, decision or order date">
          <input type="date" name="trigger_date" className={inputClass} />
        </Field>
      )}
      <Field label="Date on the notice" hint="Due date or appointment date. It always wins.">
        <input type="date" name="notice_due_date" className={inputClass} />
      </Field>
      <Field label="Who must attend" hint="Appointments only (role label)">
        <input name="attendee" className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-1 text-sm">
        <input type="checkbox" name="mailed" /> Served by mail (+3 days where the rule allows)
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices (R1, routing)
// ---------------------------------------------------------------------------

export function NoticesCard({ d }: { d: MatterData }) {
  const ids = { matter_id: d.matter.id, back: d.back };
  const filingName = (id: string | null) => {
    const f = d.filings.find((x) => x.id === id);
    return f ? `${f.form_type}${f.ref_no ? ` (${f.ref_no})` : ""}` : "";
  };
  return (
    <Card title="Notices">
      {d.notices.length === 0 ? (
        <Empty>No notices logged.</Empty>
      ) : (
        <Table head={["Type", "Filing", "Dated", "Received", "Logged", "Routed to", "Deadline", ""]}>
          {d.notices.map((n) => {
            const linked = d.deadlines.filter((x) => x.notice_id === n.id && x.status !== "cancelled");
            const review = linked.find((x) => x.kind === "review" && x.status === "open");
            const hasCycle = d.cycles.some((c) => c.filing_id === n.filing_id && c.status === "open");
            return (
              <tr key={n.id}>
                <Td>
                  <strong>{label(NOTICE_TYPES, n.notice_type)}</strong>
                  <div className="text-xs text-zinc-500">{label(CHANNELS, n.channel)}</div>
                </Td>
                <Td>{filingName(n.filing_id)}</Td>
                <Td>{formatDate(n.notice_date)}</Td>
                <Td>{formatDate(n.received_on)}</Td>
                <Td className="text-xs">
                  {formatDateTime(n.logged_at)}
                  <div className="text-zinc-500">{d.names[n.logged_by] ?? ""}</div>
                </Td>
                <Td>{n.routed_to === "attorney" ? <Badge tone="amber">Attorney, same day</Badge> : <Badge>Docketing</Badge>}</Td>
                <Td className="text-xs">
                  {n.no_deadline ? (
                    <>No deadline (attorney): {n.no_deadline_reason}</>
                  ) : (
                    linked.map((x) => (
                      <div key={x.id}>
                        {x.title}: {formatDate(x.due_date)}
                      </div>
                    ))
                  )}
                </Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    {review && d.attorney && (
                      <form action={recordNoDeadline} className="flex gap-1">
                        <Hidden values={{ back: d.back, notice_id: n.id }} />
                        <input name="reason" required placeholder="Why no deadline" className={`${inputClass} w-36`} />
                        <Button>No deadline</Button>
                      </form>
                    )}
                    {review && d.attorney && (
                      <details>
                        <summary className="cursor-pointer text-xs underline">Set a deadline instead</summary>
                        <form action={addDeadline} className="mt-1 grid gap-2">
                          <Hidden values={{ ...ids, notice_id: n.id, filing_id: n.filing_id, trigger_date: n.notice_date }} />
                          <DeadlineFields rules={d.rules} compact />
                          <p className="text-xs text-zinc-500">Then cancel the review item in Deadlines.</p>
                          <div>
                            <Button variant="primary">Add deadline</Button>
                          </div>
                        </form>
                      </details>
                    )}
                    {["rfe", "noid", "decision", "order"].includes(n.notice_type) && n.filing_id && !hasCycle && (
                      <Inline action={openCycle} values={{ back: d.back, filing_id: n.filing_id, notice_id: n.id }}>
                        <select name="kind" className={inputClass} defaultValue={n.notice_type === "noid" ? "noid" : n.notice_type === "rfe" ? "rfe" : "motion"}>
                          <Options map={CYCLE_KINDS} />
                        </select>
                        <Button>Open response</Button>
                      </Inline>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      <AddForm title="Log a notice">
        <form action={logNotice} className="grid gap-3">
          <Hidden values={ids} />
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Type">
              <select name="notice_type" required className={inputClass}>
                <Options map={NOTICE_TYPES} />
              </select>
            </Field>
            <Field label="Channel">
              <select name="channel" className={inputClass}>
                <Options map={CHANNELS} />
              </select>
            </Field>
            <Field label="Filing">
              <select name="filing_id" className={inputClass}>
                <option value="">(none)</option>
                {d.filings.map((f) => (
                  <option key={f.id} value={f.id}>
                    {filingName(f.id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notice date">
              <input type="date" name="notice_date" required className={inputClass} />
            </Field>
            <Field label="Received on" hint="Defaults to today">
              <input type="date" name="received_on" className={inputClass} />
            </Field>
            <Field label="Note">
              <input name="note" className={inputClass} placeholder="No client facts" />
            </Field>
          </div>
          <fieldset className="rounded bg-zinc-50 p-2 dark:bg-zinc-900">
            <legend className="px-1 text-sm font-medium">Deadline (rule R1: every notice gets one)</legend>
            <DeadlineFields rules={d.rules} compact />
            {d.attorney ? (
              <Field label='Or: "no deadline" (attorney only)' hint="Leave the rule and date empty and give the reason">
                <input name="no_deadline_reason" className={inputClass} />
              </Field>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">
                No deadline on this notice? Leave it empty: the attorney gets a review item due the next business day.
              </p>
            )}
          </fieldset>
          <div>
            <Button variant="primary">Log notice</Button>
          </div>
        </form>
      </AddForm>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Filings (stages 6-10 per filing)
// ---------------------------------------------------------------------------

export function FilingsCard({ d }: { d: MatterData }) {
  const ids = { matter_id: d.matter.id, back: d.back };
  const gate6 = d.gates.some((g) => g.stage === 6 && g.cycle_id === null);
  return (
    <Card title="Filings">
      {d.filings.length === 0 ? (
        <Empty>No filings yet. Record them at stage 6.</Empty>
      ) : (
        <Table head={["Form", "Forum", "Stage", "Ref no.", "Filed", "Receipt", "Decision", "Next"]}>
          {d.filings.map((f) => {
            const v = { back: d.back, filing_id: f.id };
            return (
              <tr key={f.id}>
                <Td>
                  <strong>{f.form_type}</strong>
                  {f.cycle_id && <div className="text-xs text-zinc-500">response filing</div>}
                </Td>
                <Td>{label(FORUMS, f.forum)}</Td>
                <Td>
                  {f.stage}. {stageName(f.stage)}
                </Td>
                <Td>{f.ref_no}</Td>
                <Td className="text-xs">
                  {f.filed_at ? (
                    <>
                      {formatDate(f.filed_at)}
                      <div className="text-zinc-500">
                        {f.filing_method}
                        {f.fee_cents != null && ` · $${(f.fee_cents / 100).toFixed(2)}`}
                        {f.proof_ref && ` · proof ${f.proof_ref}`}
                      </div>
                    </>
                  ) : (
                    ""
                  )}
                </Td>
                <Td className="text-xs">{f.receipt_logged_at ? formatDate(f.receipt_logged_at) : ""}</Td>
                <Td className="text-xs">
                  {f.decision && (
                    <>
                      <Badge tone={["approved", "granted"].includes(f.decision) ? "green" : "red"}>{label(DECISIONS, f.decision)}</Badge>
                      <div className="text-zinc-500">
                        {f.client_informed_at ? `Client told ${formatDate(f.client_informed_at)}` : "Client not told yet"}
                      </div>
                      {f.post_decision && <div>{label(POST_DECISION, f.post_decision)}</div>}
                    </>
                  )}
                </Td>
                <Td>
                  {!f.filed_at && !f.cycle_id && (
                    gate6 ? (
                      <Inline action={updateFiling} values={{ ...v, field: "filed" }}>
                        <input name="filing_method" placeholder="Method" required className={`${inputClass} w-24`} />
                        <input name="fee" placeholder="Fee $" inputMode="decimal" className={`${inputClass} w-20`} />
                        <input name="proof_ref" placeholder="Proof ref" className={`${inputClass} w-24`} />
                        <Button>Mark filed</Button>
                      </Inline>
                    ) : (
                      <span className="text-xs text-zinc-500">Waiting for attorney approval (stage 6)</span>
                    )
                  )}
                  {f.filed_at && !f.ref_no && (
                    <Inline action={updateFiling} values={{ ...v, field: "ref_no" }}>
                      <input name="ref_no" placeholder="Receipt / ref no." required className={`${inputClass} w-32`} />
                      <Button>Save</Button>
                    </Inline>
                  )}
                  {f.filed_at && !f.decision && (
                    <Inline action={updateFiling} values={{ ...v, field: "decision" }}>
                      <select name="decision" className={inputClass}>
                        <Options map={DECISIONS} />
                      </select>
                      <Button>Record decision</Button>
                    </Inline>
                  )}
                  {f.decision && !f.client_informed_at && d.attorney && (
                    <Inline action={updateFiling} values={{ ...v, field: "client_informed" }}>
                      <Button variant="primary">I told the client</Button>
                    </Inline>
                  )}
                  {f.decision && !f.post_decision && (
                    <Inline action={updateFiling} values={{ ...v, field: "post_decision" }}>
                      <select name="post_decision" className={inputClass}>
                        <Options map={POST_DECISION} />
                      </select>
                      <Button>Record next step</Button>
                    </Inline>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      <AddForm title="Add a filing">
        <form action={addFiling} className="flex flex-wrap items-end gap-2">
          <Hidden values={ids} />
          <Field label="Form">
            <input name="form_type" required placeholder="I-140" className={`${inputClass} w-28`} />
          </Field>
          <Field label="Forum">
            <select name="forum" className={inputClass}>
              <Options map={FORUMS} />
            </select>
          </Field>
          <Button variant="primary">Add filing</Button>
        </form>
      </AddForm>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Response cycles (RFE, NOID, motions: stages 4-5-6 again, own gates)
// ---------------------------------------------------------------------------

export function CyclesCard({ d }: { d: MatterData }) {
  if (d.cycles.length === 0) return null;
  return (
    <Card title="Response cycles">
      <div className="space-y-4">
        {d.cycles.map((c) => {
          const filing = d.filings.find((f) => f.id === c.filing_id);
          const gate = d.gates.find((g) => g.cycle_id === c.id && g.stage === c.stage);
          const checks = d.cycleChecks[c.id] ?? [];
          const items = d.checklist.filter((i) => i.cycle_id === c.id);
          const deadline = d.deadlines.find((x) => x.cycle_id === c.id);
          return (
            <div key={c.id} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <strong>{label(CYCLE_KINDS, c.kind)}</strong>
                <span className="text-sm text-zinc-500">on {filing?.form_type}</span>
                {c.status === "open" ? <Badge tone="blue">Stage {c.stage}: {stageName(c.stage)}</Badge> : <Badge tone="green">Filed {formatDate(c.filed_at)}</Badge>}
                {deadline && <span className="text-sm">Due {formatDate(deadline.due_date)}</span>}
              </div>
              {c.status === "open" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <Checks checks={checks} />
                  <div className="space-y-2">
                    {[5, 6].includes(c.stage) &&
                      (gate ? (
                        <p className="text-sm">
                          <Badge tone="green">Approved</Badge> by {d.names[gate.approved_by] ?? "attorney"}
                        </p>
                      ) : d.attorney ? (
                        <Inline action={approveGate} values={{ back: d.back, matter_id: d.matter.id, stage: c.stage, cycle_id: c.id }}>
                          <Button variant="primary">{GATE_LABELS[c.stage]}</Button>
                        </Inline>
                      ) : (
                        <Badge tone="amber">Waiting for the attorney</Badge>
                      ))}
                    <Inline action={advanceCycle} values={{ back: d.back, cycle_id: c.id }}>
                      <Button variant="primary" disabled={!checks.every((x) => x.ok)}>
                        {c.stage < 6 ? `Move to stage ${c.stage + 1}` : "Record response filed"}
                      </Button>
                    </Inline>
                  </div>
                </div>
              )}
              <ChecklistList d={d} items={items} cycleId={c.id} editable={c.status === "open" && c.stage === 4} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Evidence checklist (stage 4)
// ---------------------------------------------------------------------------

function ChecklistList({ d, items, cycleId, editable }: { d: MatterData; items: Row[]; cycleId: string | null; editable: boolean }) {
  return (
    <div className="mt-2">
      {items.length === 0 ? (
        <Empty>No checklist items.</Empty>
      ) : (
        <Table head={["Item", "Owner", "Status", ""]}>
          {items.map((i) => (
            <tr key={i.id}>
              <Td>
                {i.label} {i.third_party_draft && <Badge tone="blue">Third-party draft: attorney reviews</Badge>}
              </Td>
              <Td>{label(CHECKLIST_OWNERS, i.owner)}</Td>
              <Td>
                <Badge tone={["received", "drafted", "approved", "waived"].includes(i.status) ? "green" : "amber"}>
                  {label(CHECKLIST_STATUS, i.status)}
                </Badge>
                {i.reviewed_by && <div className="text-xs text-zinc-500">Reviewed by {d.names[i.reviewed_by]}</div>}
              </Td>
              <Td>
                <Inline action={setChecklistStatus} values={{ back: d.back, item_id: i.id }}>
                  <select name="status" defaultValue={i.status} className={inputClass}>
                    {Object.entries(CHECKLIST_STATUS)
                      .filter(([v]) => d.attorney || !i.third_party_draft || v !== "approved")
                      .map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                  </select>
                  <Button>Save</Button>
                </Inline>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {editable && (
        <form action={addChecklistItem} className="mt-2 flex flex-wrap items-center gap-2">
          <Hidden values={{ back: d.back, matter_id: d.matter.id, cycle_id: cycleId }} />
          <input name="label" required placeholder="New item" className={`${inputClass} flex-1`} />
          <select name="owner" className={inputClass}>
            <Options map={CHECKLIST_OWNERS} />
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="third_party_draft" /> Third-party draft
          </label>
          <Button>Add item</Button>
        </form>
      )}
    </div>
  );
}

export function ChecklistCard({ d }: { d: MatterData }) {
  const items = d.checklist.filter((i) => i.cycle_id === null);
  return (
    <Card title="Evidence checklist">
      <ChecklistList d={d} items={items} cycleId={null} editable={d.matter.stage <= 4 && d.matter.status !== "closed"} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Parties (conflicts per party) and appearances
// ---------------------------------------------------------------------------

export function PartiesCard({ d }: { d: MatterData }) {
  return (
    <Card title="Parties and conflict checks">
      {d.parties.length === 0 ? (
        <Empty>No parties.</Empty>
      ) : (
        <Table head={["Party", "Role", "Conflict check", ""]}>
          {d.parties.map((p) => (
            <tr key={p.id}>
              <Td>
                {p.label} {!p.is_client && <span className="text-xs text-zinc-500">(not a client)</span>}
              </Td>
              <Td>{label(PARTY_ROLES, p.party_role)}</Td>
              <Td>{p.conflict_cleared ? <Badge tone="green">Cleared</Badge> : <Badge tone="amber">Not cleared</Badge>}</Td>
              <Td>
                <Inline action={clearConflict} values={{ back: d.back, party_id: p.id, value: String(!p.conflict_cleared) }}>
                  <Button>{p.conflict_cleared ? "Undo" : "Mark cleared"}</Button>
                </Inline>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <AddForm title="Add a party">
        <form action={addParty} className="flex flex-wrap items-center gap-2">
          <Hidden values={{ back: d.back, matter_id: d.matter.id }} />
          <input name="label" required placeholder="Client 2" className={`${inputClass} flex-1`} />
          <select name="party_role" className={inputClass}>
            <Options map={PARTY_ROLES} />
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="is_client" defaultChecked /> Client
          </label>
          <Button>Add</Button>
        </form>
      </AddForm>
    </Card>
  );
}

export function AppearancesCard({ d }: { d: MatterData }) {
  const party = (id: string) => d.parties.find((p) => p.id === id)?.label ?? "";
  return (
    <Card title="Appearances">
      {d.appearances.length === 0 ? (
        <Empty>No appearance forms yet.</Empty>
      ) : (
        <Table head={["Form", "Forum", "Client", "Status", ""]}>
          {d.appearances.map((a) => (
            <tr key={a.id}>
              <Td>{label(APPEARANCE_FORMS, a.form)}</Td>
              <Td>{label(FORUMS, a.forum)}</Td>
              <Td>{party(a.party_id)}</Td>
              <Td>
                <Badge tone={a.status === "open" ? "blue" : "gray"}>{a.status}</Badge>
                {a.successor && <div className="text-xs text-zinc-500">to {a.successor.code}</div>}
              </Td>
              <Td>
                {a.status === "open" && (
                  <div className="flex flex-col gap-1">
                    <Inline action={updateAppearance} values={{ back: d.back, appearance_id: a.id, status: "transferred" }}>
                      <input name="target_code" required placeholder="Successor matter code" className={`${inputClass} w-40`} />
                      <Button>Transfer</Button>
                    </Inline>
                    <Inline action={updateAppearance} values={{ back: d.back, appearance_id: a.id, status: "closed" }}>
                      <Button>Close</Button>
                    </Inline>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <AddForm title="Add an appearance">
        <form action={addAppearance} className="flex flex-wrap items-center gap-2">
          <Hidden values={{ back: d.back, matter_id: d.matter.id }} />
          <select name="party_id" required className={inputClass}>
            {d.parties.filter((p) => p.is_client).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select name="forum" className={inputClass}>
            <Options map={FORUMS} />
          </select>
          <select name="form" className={inputClass}>
            <Options map={APPEARANCE_FORMS} />
          </select>
          <input type="date" name="filed_on" className={inputClass} />
          <Button>Add</Button>
        </form>
        <p className="mt-1 text-xs text-zinc-500">
          {Object.entries(FORM_FOR_FORUM)
            .filter(([f], i, all) => all.findIndex(([, x]) => x === FORM_FOR_FORUM[f]) === i)
            .map(([f, form]) => `${label(APPEARANCE_FORMS, form)}: ${label(FORUMS, f)}`)
            .join(" · ")}
          {" "}(G-28 also covers CBP and ICE)
        </p>
      </AddForm>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tasks and history
// ---------------------------------------------------------------------------

export function TasksCard({ d }: { d: MatterData }) {
  return (
    <Card title="Open tasks">
      {d.tasks.length === 0 ? (
        <Empty>No open tasks.</Empty>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
          {d.tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-1.5">
              <span className="w-24 shrink-0 text-zinc-500">{t.due_date ? formatDate(t.due_date) : ""}</span>
              <span className="flex-1">
                {t.title} <Badge>{ROLE_LABELS[t.owner_role]}</Badge>
              </span>
              <Inline action={completeTask} values={{ back: d.back, task_id: t.id }}>
                <Button>Done</Button>
              </Inline>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function summarize(payload: Row): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload.changed ?? payload;
  return Object.entries(p)
    .filter(([k, v]) => v !== null && !["id", "matter_id", "created_by", "logged_by"].includes(k) && !k.endsWith("_id"))
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(", ");
}

export function HistoryCard({ d }: { d: MatterData }) {
  return (
    <Card title={`History (${d.events.length} events, append-only)`}>
      <div className="max-h-96 overflow-y-auto">
        <Table head={["When", "Who", "What", "Details"]}>
          {d.events.map((e) => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(e.occurred_at)}</Td>
              <Td className="whitespace-nowrap text-xs">
                {e.actor_id ? `${d.names[e.actor_id] ?? "?"} (${ROLE_LABELS[e.actor_role] ?? ""})` : "System"}
              </Td>
              <Td className="whitespace-nowrap font-mono text-xs">{e.event_type}</Td>
              <Td className="text-xs text-zinc-500">{summarize(e.payload)}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </Card>
  );
}
