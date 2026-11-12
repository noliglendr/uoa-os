import { test } from "node:test";
import assert from "node:assert/strict";
import { actionCount, morningEmail, worthSending, type MorningCounts } from "./morning.ts";

const empty: MorningCounts = { approvals: 0, deadlinesToVerify: 0, noticesToReview: 0, draftsToReview: 0, invoicesToApprove: 0, decisionsToTell: 0, dueSoon: [], stalled: 0 };

test("nothing to act on and no deadline soon: no email", () => {
  assert.equal(worthSending(empty), false);
  assert.equal(worthSending({ ...empty, stalled: 3 }), false);
});

test("a deadline within 7 days alone is worth an email", () => {
  assert.equal(worthSending({ ...empty, dueSoon: [{ code: "Matter A", title: "RFE response", due: "2026-11-16", daysLeft: 4 }] }), true);
});

test("counts every kind of item that needs the attorney", () => {
  assert.equal(actionCount({ ...empty, approvals: 2, deadlinesToVerify: 1, noticesToReview: 1, draftsToReview: 1, invoicesToApprove: 1, decisionsToTell: 1 }), 7);
});

test("subject and body are short and list each item", () => {
  const { subject, body } = morningEmail(
    { ...empty, approvals: 1, invoicesToApprove: 2, dueSoon: [{ code: "Matter B", title: "NOID response", due: "2026-11-12", daysLeft: 0 }], stalled: 1 },
    "2026-11-12",
    "https://uoa-os.example",
  );
  assert.equal(subject, "[UOA OS] 2026-11-12: 3 items need you · 1 deadline in 7 days");
  assert.match(body, /- 1 stage approval\n/);
  assert.match(body, /- 2 invoices to approve/);
  assert.match(body, /Matter B: NOID response, due TODAY \(2026-11-12\)/);
  assert.match(body, /1 matter with no activity lately/);
  assert.match(body, /Open My work: https:\/\/uoa-os\.example\//);
});

test("overdue deadlines say so", () => {
  const { body } = morningEmail({ ...empty, dueSoon: [{ code: "Matter C", title: "Brief", due: "2026-11-10", daysLeft: -2 }] }, "2026-11-12", "x");
  assert.match(body, /2 days OVERDUE/);
  assert.match(body, /- Nothing today\./);
});
