// Building AI letter drafts (Step A, docs/increment3-plan.md).
// The privacy rule lives here: draftFacts() is the only matter data the AI sees,
// and it copies named fields only. Unit tests: drafting.test.ts.

export type DraftKind = "cover_letter" | "evidence_request" | "closing_letter";

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
