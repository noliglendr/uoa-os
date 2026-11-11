// Firm dashboard KPIs (decision #30). Synthetic data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvalWait, deadlineRecord, decisionCounts, lastMonths, mattersByMonth, outboxRecord, percent, receiptRecord, revenue,
  stageDurations, stageEntries,
} from "./kpis.ts";

test("the last months run oldest first, across a year end", () => {
  assert.deepEqual(lastMonths("2026-02-15", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("percent rounds, and is empty with nothing to count", () => {
  assert.equal(percent(2, 3), 67);
  assert.equal(percent(0, 0), null);
});

const matters = [{ id: "m1", created_at: "2026-10-01T15:00:00Z" }, { id: "m2", created_at: "2026-11-02T15:00:00Z" }];
const events = [
  { matter_id: "m1", occurred_at: "2026-10-05T15:00:00Z", from: 1, to: 2 },
  { matter_id: "m1", occurred_at: "2026-10-15T15:00:00Z", from: 2, to: 3 },
  { matter_id: "m2", occurred_at: "2026-11-04T15:00:00Z", from: 1, to: 2 },
];

test("matters opened and closed per month (firm time)", () => {
  const rows = mattersByMonth(matters, [{ occurred_at: "2026-11-01T03:00:00Z" }], ["2026-10", "2026-11"]);
  // 3 am UTC on Nov 1 is still Oct 31 in Texas.
  assert.deepEqual(rows, [{ month: "2026-10", opened: 1, closed: 1 }, { month: "2026-11", opened: 1, closed: 0 }]);
});

test("average days in each stage left", () => {
  const out = stageDurations(matters, events);
  assert.equal(out[0].avgDays, 3); // stage 1: 4 days and 2 days
  assert.equal(out[0].matters, 2);
  assert.equal(out[1].avgDays, 10);
  assert.equal(out[2].avgDays, null); // nobody has left stage 3
});

test("approval wait counts from reaching the gate stage", () => {
  const entries = stageEntries(matters, events);
  const w = approvalWait([{ matter_id: "m1", stage: 2, cycle_id: null, approved_at: "2026-10-07T15:00:00Z" }], entries);
  assert.deepEqual(w, { approvals: 1, avgDays: 2, maxDays: 2 });
});

test("deadlines: on time, late, missed and overdue; cancelled and old ones left out", () => {
  const r = deadlineRecord([
    { kind: "response", status: "met", due_date: "2026-11-05", completed_at: "2026-11-04T15:00:00Z" },
    { kind: "response", status: "met", due_date: "2026-11-05", completed_at: "2026-11-06T15:00:00Z" },
    { kind: "response", status: "missed", due_date: "2026-11-01", completed_at: null },
    { kind: "response", status: "open", due_date: "2026-11-09", completed_at: null },
    { kind: "response", status: "open", due_date: "2026-11-20", completed_at: null },
    { kind: "response", status: "cancelled", due_date: "2026-11-01", completed_at: null },
    { kind: "appointment", status: "met", due_date: "2026-11-01", completed_at: null },
    { kind: "response", status: "met", due_date: "2025-01-01", completed_at: null },
  ], "2026-11-10", "2025-12-01");
  assert.deepEqual(r, { onTime: 1, late: 2, overdue: 1, counted: 4, rate: 25 });
});

test("receipts logged within the business days after filing", () => {
  const r = receiptRecord([
    { filed_at: "2026-11-06T15:00:00Z", receipt_logged_at: "2026-11-09T15:00:00Z" }, // Fri -> Mon: on time
    { filed_at: "2026-11-02T15:00:00Z", receipt_logged_at: "2026-11-05T15:00:00Z" }, // late
    { filed_at: "2026-11-02T15:00:00Z", receipt_logged_at: null }, // still waiting
    { filed_at: "2026-11-09T15:00:00Z", receipt_logged_at: null }, // not due yet
    { filed_at: null, receipt_logged_at: null },
  ], "2026-11-10", "2026-01-01", 1);
  assert.deepEqual(r, { onTime: 1, late: 1, waiting: 1, counted: 3, rate: 33 });
});

test("decisions and outbox", () => {
  assert.deepEqual(decisionCounts([{ filed_at: null, receipt_logged_at: null, decision: "approved" }, { filed_at: null, receipt_logged_at: null, decision: "approved", voided_at: "x" }]), { approved: 1 });
  const o = outboxRecord([
    { status: "sent", created_at: "2026-11-01T10:00:00Z", sent_at: "2026-11-01T15:00:00Z" },
    { status: "sent", created_at: "2026-11-01T10:00:00Z", sent_at: "2026-11-04T15:00:00Z" },
    { status: "waiting", created_at: "2026-11-01T10:00:00Z", sent_at: null },
  ]);
  assert.deepEqual(o, { sent: 2, waiting: 1, cancelled: 0, withinDayRate: 50 });
});

test("revenue counts approved and entered invoices, never drafts or void", () => {
  const r = revenue([
    { status: "sent", amount_cents: 150000, approved_at: "2026-11-02T15:00:00Z", sent_at: "2026-11-03T15:00:00Z", matter_type: "petition" },
    { status: "approved", amount_cents: 50000, approved_at: "2026-10-02T15:00:00Z", sent_at: null, matter_type: "application" },
    { status: "draft", amount_cents: null, approved_at: null, sent_at: null, matter_type: "petition" },
    { status: "void", amount_cents: 99900, approved_at: "2026-11-02T15:00:00Z", sent_at: null, matter_type: "petition" },
  ], ["2026-10", "2026-11"]);
  assert.deepEqual(r.byMonth, [{ month: "2026-10", cents: 50000 }, { month: "2026-11", cents: 150000 }]);
  assert.deepEqual(r.byType, { petition: 150000, application: 50000 });
  assert.equal(r.totalBilled, 200000);
  assert.equal(r.approvedNotEntered, 50000);
  assert.equal(r.draftsWithoutAmount, 1);
});
