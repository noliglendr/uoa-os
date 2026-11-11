// Building AI letter drafts (Step A, docs/increment3-plan.md).
// The privacy rule lives here: draftFacts() is the only matter data the AI sees,
// and it copies named fields only. Unit tests: drafting.test.ts.

export type DraftKind = "cover_letter" | "evidence_request" | "closing_letter" | "response_outline" | "statement_draft";

/** Step B kinds send case facts to the AI, so they need the D24 switch. */
export const CASE_FACT_KINDS: DraftKind[] = ["response_outline", "statement_draft"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Form names only ("I-130"). Anything else in that free-text field stays out. */
const FORM_TYPE = /^[A-Z]{1,4}-\d{1,4}[A-Z]?$/;

/** Fixed lists and numbers only: never names, reference numbers, notes or labels typed by staff. */
export function draftFacts(matter: Row, filing: Row | null) {
  return {
    matter_type: matter.matter_type,
    stage: matter.stage,
    ...(filing && {
      form_type: FORM_TYPE.test(filing.form_type ?? "") ? filing.form_type : "[FORM TYPE]",
      forum: filing.forum,
      decision: filing.decision ?? null,
      next_step: filing.post_decision ?? null,
    }),
  };
}

const SYSTEM = `You prepare first drafts of routine letters for an immigration law firm. An attorney reviews every draft before anyone uses it.

Adapt the letter template to the facts given, keeping the template's meaning and order. Keep every blank in square brackets, such as [CLIENT NAME] or [ITEM LIST], exactly as written: staff fill them in later. Add no names, dates, numbers, facts, promises, legal citations or legal advice that are not in the template or the facts. If a fact is missing, keep the template's wording or blank.

Reply with the letter text only, as plain text.`;

export function draftPrompt(templateBody: string, facts: ReturnType<typeof draftFacts>) {
  return {
    system: SYSTEM,
    user: `<template>\n${templateBody}\n</template>\n\n<facts>\n${JSON.stringify(facts, null, 2)}\n</facts>`,
  };
}

/** Blanks in the template that the draft lost. */
export function missingBlanks(templateBody: string, draft: string): string[] {
  const blanks = new Set(templateBody.match(/\[[^\]\n]+\]/g) ?? []);
  return [...blanks].filter((b) => !draft.includes(b));
}

const ITEMS: Record<DraftKind, (i: Row) => boolean> = {
  cover_letter: (i) => ["received", "drafted", "approved"].includes(i.status),
  evidence_request: (i) => i.owner !== "firm" && ["needed", "requested"].includes(i.status),
  closing_letter: () => false,
  response_outline: () => false,
  statement_draft: () => false,
};

/**
 * UOA OS (not the AI) fills the two firm blanks after the AI has finished:
 * [DATE] with today's date (firm time) and [ATTORNEY NAME] with the matter's
 * attorney of record. Client blanks such as [CLIENT NAME] stay for staff.
 */
export function fillFirmBlanks(body: string, { today, attorney }: { today: Date; attorney: string | null }): string {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" }).format(today);
  const filled = body.replaceAll("[DATE]", date);
  return attorney?.trim() ? filled.replaceAll("[ATTORNEY NAME]", attorney.trim()) : filled;
}

/**
 * Puts the matter's checklist into [ITEM LIST] after the AI has finished, so
 * those labels never reach it.
 */
export function fillItemList(body: string, kind: DraftKind, checklist: Row[]): string {
  const labels = checklist.filter((i) => !i.voided_at && ITEMS[kind](i)).map((i) => `- ${i.label}`);
  return body.replaceAll("[ITEM LIST]", labels.length ? labels.join("\n") : "[NO ITEMS ON THE CHECKLIST: ADD THEM HERE]");
}

// ---------------------------------------------------------------------------
// Step B (decision #32): response outlines and statement drafts. These send
// case facts, so they run only with drafting.case_facts on (D24). Still a
// fixed list of fields: names, numbers and notes from the records never go.
// ---------------------------------------------------------------------------

/** Lines typed by staff: list marks removed, no empty lines, at most `max`, each at most 500 characters. */
export function cleanLines(text: string, max = 20): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, max);
}

export const NOTICE_NAMES: Record<string, string> = { rfe: "Request for Evidence (RFE)", noid: "Notice of Intent to Deny (NOID)" };

/** The response cycle, its form and forum, the issues staff typed, and the evidence list. */
export function outlineFacts(cycle: Row, filing: Row | null, issues: string[], evidence: Row[]) {
  return {
    notice: NOTICE_NAMES[cycle.kind] ?? "agency notice",
    form_type: FORM_TYPE.test(filing?.form_type ?? "") ? filing.form_type : "[FORM TYPE]",
    forum: filing?.forum ?? null,
    issues,
    evidence: evidence.filter((i) => !i.voided_at).map((i) => ({ item: i.label, status: i.status })),
  };
}

export const STATEMENT_PURPOSES: Record<string, string> = {
  personal: "Personal declaration of the client",
  relationship: "Statement about a relationship (e.g. a marriage), from someone who knows it",
  hardship: "Hardship statement",
  support: "Support statement from a third party",
};

/** Who speaks (a role label, never a name), the purpose, and the facts staff typed. */
export function statementFacts(speakerRole: string | null, purpose: string, facts: string[]) {
  return {
    speaker: speakerRole ?? "the client",
    purpose: STATEMENT_PURPOSES[purpose] ?? STATEMENT_PURPOSES.personal,
    facts,
  };
}

const RULES = `Keep every blank in square brackets, such as [CLIENT NAME] or [ATTORNEY TO WRITE ARGUMENT], exactly as written: people fill them in later. Replace the instruction in double braces {{...}} with your text, and remove the braces. Add no names, dates, numbers, places or facts that are not in the facts given. Reply with the text only, as plain text.`;

const SYSTEM_B: Record<"response_outline" | "statement_draft", string> = {
  response_outline: `You prepare a first-draft OUTLINE of a response to a USCIS Request for Evidence or Notice of Intent to Deny, for an immigration attorney who writes the argument and decides everything.

Write one numbered section for each issue given, in the given order, with the four parts the template asks for. Under "Evidence we will submit", list only items from the evidence list that plainly address that issue, with their status; if none does, write [EVIDENCE NEEDED]. Do not write legal argument, cite law, cases or policy, or say whether the case will succeed: keep [ATTORNEY TO WRITE ARGUMENT]. Note a gap only when the facts show it.

${RULES}`,
  statement_draft: `You prepare a first draft of a sworn statement for an immigration case, for an attorney to review and the person to correct and confirm.

Write in the first person, as the speaker, in short numbered paragraphs and plain words. Use only the facts given, in a sensible order. Do not invent, add or embellish any fact, date, place, feeling or detail. Where the statement clearly needs a fact that is missing, write [ASK THE CLIENT: what is missing]. Refer to people by the role words given, or by a blank such as [SPOUSE NAME]; never make up a name.

${RULES}`,
};

export function stepBPrompt(kind: "response_outline" | "statement_draft", templateBody: string, facts: object) {
  return {
    system: SYSTEM_B[kind],
    user: `<template>\n${templateBody}\n</template>\n\n<facts>\n${JSON.stringify(facts, null, 2)}\n</facts>`,
  };
}

/** UOA OS fills the outline's record blanks after the AI has finished. */
export function fillOutlineBlanks(
  body: string,
  { notice, formType, due, exhibits }: { notice: string; formType: string | null; due: string | null; exhibits: string[] },
): string {
  return body
    .replaceAll("[NOTICE TYPE]", notice)
    .replaceAll("[FORM TYPE]", formType && FORM_TYPE.test(formType) ? formType : "[FORM TYPE]")
    .replaceAll("[RESPONSE DUE]", due ?? "[RESPONSE DUE: SET THE DEADLINE]")
    .replaceAll("[EXHIBIT LIST]", exhibits.length ? exhibits.map((e, i) => `Exhibit ${i + 1}: ${e}`).join("\n") : "[NO ITEMS ON THE CHECKLIST YET]");
}
