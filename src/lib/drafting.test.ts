// Unit tests for AI letter drafts. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftFacts, draftPrompt, fillFirmBlanks, fillItemList, missingBlanks } from "./drafting.ts";

const SECRET = "SECRET-VALUE";

test("the prompt carries no free-text or personal fields", () => {
  const matter = { id: SECRET, code: SECRET, summary: SECRET, matter_type: "petition", stage: 6, attorney_id: SECRET, conflict_note: SECRET };
  const filing = {
    id: SECRET, form_type: SECRET, forum: "uscis", ref_no: SECRET, proof_ref: SECRET, filing_method: SECRET,
    filed_at: SECRET, decided_at: SECRET, decision: "approved", post_decision: "none",
  };
  const { system, user } = draftPrompt("Template", draftFacts(matter, filing));
  assert.ok(!system.includes(SECRET));
  assert.ok(!user.includes(SECRET));
  assert.ok(user.includes('"forum": "uscis"'));
});

test("only form names pass as the form type", () => {
  const form = (form_type: string) => (draftFacts({}, { form_type }) as { form_type: string }).form_type;
  assert.equal(form("I-130"), "I-130");
  assert.equal(form("EOIR-28"), "EOIR-28");
  assert.equal(form("I-130 for a named person"), "[FORM TYPE]");
  assert.equal(form(""), "[FORM TYPE]");
});

test("no filing means no filing facts", () => {
  assert.deepEqual(draftFacts({ matter_type: "petition", stage: 4 }, null), { matter_type: "petition", stage: 4 });
});

test("a lost blank is found", () => {
  const template = "Dear [CLIENT NAME]: see [ITEM LIST]. Again [CLIENT NAME].";
  assert.deepEqual(missingBlanks(template, "Dear [CLIENT NAME]: see below."), ["[ITEM LIST]"]);
  assert.deepEqual(missingBlanks(template, "Dear [CLIENT NAME]: see [ITEM LIST]."), []);
});

test("the item list fills in by letter type and skips rows entered in error", () => {
  const checklist = [
    { label: "Needed from client", owner: "client", status: "needed" },
    { label: "Needed from firm", owner: "firm", status: "needed" },
    { label: "Received", owner: "client", status: "received" },
    { label: "Mistake", owner: "client", status: "needed", voided_at: "2026-11-05" },
  ];
  assert.equal(fillItemList("[ITEM LIST]", "evidence_request", checklist), "- Needed from client");
  assert.equal(fillItemList("[ITEM LIST]", "cover_letter", checklist), "- Received");
  assert.match(fillItemList("[ITEM LIST]", "closing_letter", checklist), /NO ITEMS/);
});

test("UOA OS fills the date and attorney, never the client blanks", () => {
  const today = new Date("2026-11-10T03:00:00Z"); // still Nov 9 in Texas
  const body = ["[DATE]", "Dear [CLIENT NAME]:", "[ATTORNEY NAME]"].join("\n");
  assert.equal(fillFirmBlanks(body, { today, attorney: "Attorney One" }), ["November 9, 2026", "Dear [CLIENT NAME]:", "Attorney One"].join("\n"));
  assert.equal(fillFirmBlanks(body, { today, attorney: null }), body.replace("[DATE]", "November 9, 2026"));
});
