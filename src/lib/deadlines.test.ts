// Unit tests for the deadline module. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDeadline,
  escalationDue,
  federalHolidays,
  isBusinessDay,
  nextBusinessDay,
  addDays,
  describeDue,
  today,
  type DeadlineRule,
} from "./deadlines.ts";

// Draft rules as in docs/deadline-rules.md (not verified).
const rule = (r: Partial<DeadlineRule> & Pick<DeadlineRule, "code" | "days">): DeadlineRule => ({
  label: r.code,
  kind: "response",
  mailingExtension: false,
  prepDays: null,
  attorneyVerified: false,
  ...r,
});

const U1 = rule({ code: "U1", days: null }); // RFE: date on the notice
const U2 = rule({ code: "U2", days: 30, mailingExtension: true }); // NOID
const U3 = rule({ code: "U3", days: 30, mailingExtension: true }); // I-290B appeal
const U4 = rule({ code: "U4", days: 30, mailingExtension: true }); // I-290B motion
const U5 = rule({ code: "U5", days: null, kind: "appointment", prepDays: 14 }); // biometrics
const U6 = rule({ code: "U6", days: null, kind: "appointment", prepDays: 14 }); // interview
const U7 = rule({ code: "U7", days: null }); // I-751: set per matter
const E1 = rule({ code: "E1", days: 90 }); // IJ motion to reopen
const E2 = rule({ code: "E2", days: 180 }); // in absentia
const E3 = rule({ code: "E3", days: 30 }); // IJ motion to reconsider
const E4 = rule({ code: "E4", days: 10 }); // DHS response
const E5 = rule({ code: "E5", days: null, kind: "appointment", prepDays: 14 }); // hearing
const B1 = rule({ code: "B1", days: 30 }); // BIA appeal
const B2 = rule({ code: "B2", days: 90 });
const B3 = rule({ code: "B3", days: 30 });
const B4 = rule({ code: "B4", days: 13 });
const B5 = rule({ code: "B5", days: null }); // briefing schedule
const F1 = rule({ code: "F1", days: 30 }); // petition for review

const base = { mailed: false, mailingExtensionDays: 3 };

test("federal holidays 2026", () => {
  const h = federalHolidays(2026);
  for (const d of [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
    "2026-07-03", // July 4 is a Saturday: observed Friday
    "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
  ]) assert.ok(h.has(d), d);
  assert.equal(h.size, 11);
});

test("observed holidays: Sunday moves to Monday; Jan 1 on Saturday is observed Dec 31", () => {
  assert.ok(federalHolidays(2027).has("2027-07-05")); // July 4, 2027 is a Sunday
  assert.ok(federalHolidays(2027).has("2027-12-31")); // Jan 1, 2028 is a Saturday
  assert.equal(isBusinessDay("2027-12-31"), false);
});

test("business days", () => {
  assert.equal(nextBusinessDay("2026-11-07"), "2026-11-09"); // Saturday -> Monday
  assert.equal(nextBusinessDay("2026-11-11"), "2026-11-12"); // Veterans Day
  assert.equal(nextBusinessDay("2026-11-26"), "2026-11-27"); // Thanksgiving -> Friday
  assert.equal(nextBusinessDay("2026-11-04"), "2026-11-04");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("U1 RFE: the date on the notice controls; no mailing extension", () => {
  const r = computeDeadline({ ...base, rule: U1, triggerDate: "2026-11-02", noticeDate: "2027-01-25", mailed: true });
  assert.equal(r.dueDate, "2027-01-25");
  assert.equal(r.mailingExtension, false);
  assert.throws(() => computeDeadline({ ...base, rule: U1, triggerDate: "2026-11-02" }), /date on the notice/);
});

test("U2 NOID: 30 days, +3 when mailed", () => {
  assert.equal(computeDeadline({ ...base, rule: U2, triggerDate: "2026-11-02" }).dueDate, "2026-12-02");
  const mailed = computeDeadline({ ...base, rule: U2, triggerDate: "2026-11-02", mailed: true });
  assert.equal(mailed.rawDueDate, "2026-12-05"); // Saturday
  assert.equal(mailed.dueDate, "2026-12-07");
  assert.equal(mailed.mailingExtension, true);
  assert.ok(mailed.warnings.some((w) => w.includes("file by 2026-12-05")));
});

test("U2 NOID: a date printed on the notice wins over the rule, with a warning", () => {
  const r = computeDeadline({ ...base, rule: U2, triggerDate: "2026-11-02", noticeDate: "2026-11-30" });
  assert.equal(r.dueDate, "2026-11-30");
  assert.ok(r.warnings.some((w) => w.includes("differs from the rule")));
});

test("U3 and U4 I-290B: 30 days from the decision, 33 if mailed", () => {
  for (const r of [U3, U4]) {
    assert.equal(computeDeadline({ ...base, rule: r, triggerDate: "2026-10-01" }).dueDate, "2026-11-02"); // Oct 31 is Saturday
    assert.equal(computeDeadline({ ...base, rule: r, triggerDate: "2026-10-01", mailed: true }).dueDate, "2026-11-03");
  }
});

test("U5, U6, E5 appointments: exact date, prep task 14 days before on a business day", () => {
  const bio = computeDeadline({ ...base, rule: U5, triggerDate: "2026-11-02", noticeDate: "2026-11-21" }); // Saturday
  assert.equal(bio.kind, "appointment");
  assert.equal(bio.dueDate, "2026-11-21"); // appointments are not moved
  assert.equal(bio.prepDate, "2026-11-06"); // Nov 7 is Saturday -> Friday
  assert.equal(computeDeadline({ ...base, rule: U6, triggerDate: null, noticeDate: "2026-12-15" }).prepDate, "2026-12-01");
  assert.equal(computeDeadline({ ...base, rule: E5, triggerDate: null, noticeDate: "2027-02-10" }).prepDate, "2027-01-27");
});

test("U7 and B5: set per matter, so the date must be entered", () => {
  assert.equal(computeDeadline({ ...base, rule: U7, triggerDate: null, noticeDate: "2028-03-01" }).dueDate, "2028-03-01");
  assert.throws(() => computeDeadline({ ...base, rule: B5, triggerDate: "2026-11-02" }));
});

test("EOIR, BIA and federal windows never get the mailing extension", () => {
  const cases: [DeadlineRule, string][] = [
    [E1, "2027-01-29"], [E2, "2027-04-29"], [E3, "2026-11-30"], [E4, "2026-11-10"],
    [B1, "2026-11-30"], [B2, "2027-01-29"], [B3, "2026-11-30"], [B4, "2026-11-13"], [F1, "2026-11-30"],
  ];
  for (const [r, due] of cases) {
    const c = computeDeadline({ ...base, rule: r, triggerDate: "2026-10-31", mailed: true });
    assert.equal(c.mailingExtension, false, r.code);
    assert.equal(c.dueDate, due, r.code);
  }
});

test("E4: 10 days landing on Veterans Day moves to the next business day", () => {
  const c = computeDeadline({ ...base, rule: E4, triggerDate: "2026-11-01" });
  assert.equal(c.rawDueDate, "2026-11-11");
  assert.equal(c.dueDate, "2026-11-12");
});

test("unverified rules and hand-entered dates always warn", () => {
  assert.ok(computeDeadline({ ...base, rule: E1, triggerDate: "2026-11-02" }).warnings.some((w) => w.includes("not verified")));
  const verified = computeDeadline({ ...base, rule: { ...E1, attorneyVerified: true }, triggerDate: "2026-11-03" });
  assert.deepEqual(verified.warnings, []);
  assert.ok(computeDeadline({ ...base, rule: null, triggerDate: null, noticeDate: "2026-12-01" }).warnings[0].includes("by hand"));
});

test("bad input is rejected", () => {
  assert.throws(() => computeDeadline({ ...base, rule: E1, triggerDate: "2026-02-30" }), /Invalid date/);
  assert.throws(() => computeDeadline({ ...base, rule: E1, triggerDate: null }), /start date/);
  assert.throws(() => computeDeadline({ ...base, rule: null, triggerDate: "2026-11-10", noticeDate: "2026-11-01" }), /before/);
});

test("R2 escalations at 21, 14, 7, 3, 1 days", () => {
  const t = [21, 14, 7, 3, 1];
  assert.equal(escalationDue(30, t, []), null);
  assert.deepEqual(escalationDue(21, t, []), { send: 21, markSent: [21] });
  assert.equal(escalationDue(20, t, [21]), null);
  assert.deepEqual(escalationDue(14, t, [21]), { send: 14, markSent: [14] });
  // The job missed days: send the closest threshold once, cover the larger ones.
  assert.deepEqual(escalationDue(5, t, []), { send: 7, markSent: [7, 14, 21] });
  assert.deepEqual(escalationDue(0, t, [21, 14, 7, 3]), { send: 1, markSent: [1] });
  assert.equal(escalationDue(-2, t, [21, 14, 7, 3, 1]), null);
});

test("countdown text and firm-time-zone today", () => {
  assert.equal(describeDue("2026-11-03", "2026-11-03"), "due today");
  assert.equal(describeDue("2026-11-04", "2026-11-03"), "in 1 day");
  assert.equal(describeDue("2026-11-01", "2026-11-03"), "2 days overdue");
  // 03:00 UTC on Nov 4 is still Nov 3 in Texas.
  assert.equal(today(new Date("2026-11-04T03:00:00Z")), "2026-11-03");
});
