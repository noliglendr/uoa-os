// Staff follow-ups (Increment 4, Step 1). Synthetic data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addBusinessDays, documentFollowups, dueToSend, overdueTaskFollowups, receiptFollowups, stalledFollowups } from "./followups.ts";

test("business days skip weekends and federal holidays", () => {
  assert.equal(addBusinessDays("2026-11-06", 1), "2026-11-09"); // Friday -> Monday
  assert.equal(addBusinessDays("2026-11-10", 1), "2026-11-12"); // Nov 11 is Veterans Day
  assert.equal(addBusinessDays("2026-11-02", 2), "2026-11-04");
});

test("a receipt is late only after its business day has passed", () => {
  const filing = { id: "f1", matter_id: "m1", form_type: "I-130", filed_at: "2026-11-06T15:00:00Z" }; // Friday
  assert.equal(receiptFollowups([filing], "2026-11-09", 1).length, 0); // due Monday
  const [late] = receiptFollowups([filing], "2026-11-10", 1);
  assert.equal(late.key, "receipt:f1");
  assert.equal(late.title, "Receipt not logged: I-130");
  assert.deepEqual(late.roles, ["docketing", "paralegal", "principal"]);
});

test("the filing date is the firm's date, not UTC", () => {
  // 9 pm in Texas on Monday Nov 9 is already Nov 10 in UTC.
  const filing = { id: "f1", matter_id: "m1", form_type: "I-130", filed_at: "2026-11-10T03:00:00Z" };
  assert.match(receiptFollowups([filing], "2026-11-12", 1)[0]?.detail ?? "", /Filed 2026-11-09/);
});

test("free text in the form type never reaches the email", () => {
  const filing = { id: "f1", matter_id: "m1", form_type: "petition for a named person", filed_at: "2026-11-02" };
  assert.equal(receiptFollowups([filing], "2026-11-10", 1)[0].title, "Receipt not logged: filing");
});

test("a matter is stalled after the quiet days, with a new key per quiet spell", () => {
  assert.equal(stalledFollowups([{ id: "m1", last: "2026-10-28" }], "2026-11-10", 14).length, 0);
  const [s] = stalledFollowups([{ id: "m1", last: "2026-10-27" }], "2026-11-10", 14);
  assert.equal(s.key, "stalled:m1:2026-10-27");
  assert.equal(s.repeatDays, 7);
  assert.deepEqual(s.roles, ["attorney", "principal"]);
});

test("only tasks past their due date are overdue, and go to the task's role", () => {
  const tasks = [
    { id: "t1", matter_id: "m1", title: "Prepare for: Interview", owner_role: "paralegal", due_date: "2026-11-09" },
    { id: "t2", matter_id: "m1", title: "Review RFE notice", owner_role: "attorney", due_date: "2026-11-10" },
    { id: "t3", matter_id: "m1", title: "No date", owner_role: "docketing", due_date: null },
  ];
  const out = overdueTaskFollowups(tasks, "2026-11-10");
  assert.deepEqual(out.map((t) => t.key), ["task:t1"]);
  assert.deepEqual(out[0].roles, ["paralegal"]);
  assert.match(out[0].detail, /1 day late/);
  assert.deepEqual(overdueTaskFollowups([{ ...tasks[1], due_date: "2026-11-01" }], "2026-11-10")[0].roles, ["attorney", "principal"]);
});

test("an item is emailed once per repeat period", () => {
  const [receipt] = receiptFollowups([{ id: "f1", matter_id: "m1", form_type: "I-130", filed_at: "2026-11-02" }], "2026-11-10", 1);
  const [stalled] = stalledFollowups([{ id: "m1", last: "2026-10-01" }], "2026-11-10", 14);
  const items = [receipt, stalled];
  assert.equal(dueToSend(items, [], "2026-11-10").length, 2);
  const sentToday = [{ key: receipt.key, sent_on: "2026-11-10" }, { key: stalled.key, sent_on: "2026-11-10" }];
  assert.equal(dueToSend(items, sentToday, "2026-11-10").length, 0);
  const sentYesterday = [{ key: receipt.key, sent_on: "2026-11-09" }, { key: stalled.key, sent_on: "2026-11-09" }];
  assert.deepEqual(dueToSend(items, sentYesterday, "2026-11-10").map((i) => i.kind), ["receipt"]); // stalled waits a week
  assert.equal(dueToSend([stalled], [{ key: stalled.key, sent_on: "2026-11-03" }], "2026-11-10").length, 1);
});

test("a requested document is overdue some days after its latest due date", () => {
  const item = (status: string) => ({ item: { id: "i1", matter_id: "m1", label: "Passport copy", status, voided_at: null } });
  const requests = [
    { due_date: "2026-11-01", items: [item("requested")] },
    { due_date: "2026-11-05", items: [item("requested")] }, // asked again: the later date counts
  ];
  assert.equal(documentFollowups(requests, "2026-11-11", 7).length, 0);
  const [d] = documentFollowups(requests, "2026-11-12", 7);
  assert.equal(d.key, "documents:i1");
  assert.match(d.detail, /Due 2026-11-05 \(7 days late\)/);
  assert.equal(documentFollowups([{ due_date: "2026-10-01", items: [item("received")] }], "2026-11-12", 7).length, 0);
});
