// The attorney's morning email: one short summary on business days, so Frank
// knows in seconds whether he needs to open UOA OS. Matter codes only: no
// client data.

export type MorningCounts = {
  approvals: number; // stage approvals (2, 3, 5, 6), including response cycles
  deadlinesToVerify: number;
  noticesToReview: number; // notices waiting for a deadline or "no deadline"
  draftsToReview: number; // AI drafts and third-party drafts
  invoicesToApprove: number;
  decisionsToTell: number;
  dueSoon: { code: string; title: string; due: string; daysLeft: number }[]; // next 7 days
  stalled: number;
};

/** Things that need the attorney today (not counting deadlines that are merely coming up). */
export function actionCount(c: MorningCounts): number {
  return c.approvals + c.deadlinesToVerify + c.noticesToReview + c.draftsToReview + c.invoicesToApprove + c.decisionsToTell;
}

/** Send only when there is something to act on or a deadline within 7 days. */
export function worthSending(c: MorningCounts): boolean {
  return actionCount(c) > 0 || c.dueSoon.length > 0;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function morningEmail(c: MorningCounts, date: string, appUrl: string): { subject: string; body: string } {
  const n = actionCount(c);
  const parts = [n ? plural(n, "item needs you", "items need you") : "Nothing needs you", plural(c.dueSoon.length, "deadline") + " in 7 days"];
  const subject = `[UOA OS] ${date}: ${parts.join(" · ")}`;

  const lines: string[] = [];
  const add = (count: number, text: string) => count > 0 && lines.push(`- ${count} ${text}`);
  add(c.approvals, c.approvals === 1 ? "stage approval" : "stage approvals");
  add(c.deadlinesToVerify, c.deadlinesToVerify === 1 ? "deadline to verify" : "deadlines to verify");
  add(c.noticesToReview, c.noticesToReview === 1 ? "notice to review" : "notices to review");
  add(c.draftsToReview, c.draftsToReview === 1 ? "draft to review" : "drafts to review");
  add(c.invoicesToApprove, c.invoicesToApprove === 1 ? "invoice to approve" : "invoices to approve");
  add(c.decisionsToTell, c.decisionsToTell === 1 ? "decision to tell the client" : "decisions to tell the client");

  const due = c.dueSoon.map((d) => `- ${d.code}: ${d.title}, ${d.daysLeft < 0 ? `${-d.daysLeft} days OVERDUE` : d.daysLeft === 0 ? "due TODAY" : `due in ${plural(d.daysLeft, "day")}`} (${d.due})`);

  const body = [
    "Good morning.",
    "",
    "NEEDS YOU",
    ...(lines.length ? lines : ["- Nothing today."]),
    "",
    "DEADLINES IN THE NEXT 7 DAYS",
    ...(due.length ? due : ["- None."]),
    ...(c.stalled > 0 ? ["", `${plural(c.stalled, "matter")} with no activity lately.`] : []),
    "",
    `Open My work: ${appUrl}/`,
  ].join("\n");
  return { subject, body };
}
