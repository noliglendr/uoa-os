---
title: "Increment 4 Plan"
subtitle: "Automation (memo capability 6)"
---

# 1. Summary

**What it is:** capability 6 of the Phase 1 memo: "Deadlines, client status updates, follow-ups and invoices fire on triggers."

**The rule:** UOA OS **notices and prepares**; a person **checks and sends**. Nothing goes to a client without human sign-off, and decisions are told by the attorney only.

**Already automated (Increment 1):** every notice creates a deadline (R1), deadline reminders at 21/14/7/3/1 days (R2), engagement alert date emails (redline 3), prep tasks for appointments (redline 10), notice routing tasks (redline 8).

# 2. Steps

| Step | What | Needs from Frank | Status |
|---|---|---|---|
| 1 | **Staff follow-ups**: late receipts, stalled matters, overdue tasks, in "My work" and one daily email per person | Nothing | Built Nov 10 (decision #28) |
| 2 | **Client updates, prepared not sent**: receipt arrived, biometrics or interview scheduled. A message from an approved template waits in an Outbox; staff click Send | Approve templates; D11 stays off | Planned |
| 3 | **Client follow-ups**: unsigned engagement, missing documents (after Increment 2), through the Outbox | Same as Step 2 | Planned |
| 4 | **Invoices**: fee phases trigger an invoice draft; the attorney approves; the payment tool sends and collects | Fee schedule; billing tool (recommended: LawPay) | Planned |

Steps 2–4 use synthetic data until D9 (real client data) is decided.

# 3. Step 1 in detail

| Follow-up | When | Who gets it | Repeats |
|---|---|---|---|
| Receipt not logged | A filed filing has no receipt or proof logged within `followup.receipt_business_days` (default 1) business days | Docketing, paralegal, principal | Daily until logged |
| Stalled matter | Nothing logged by staff for `dashboard.stalled_days` (default 14) days | Attorney of record, principal | Weekly while quiet |
| Overdue task | An open task is past its due date | The task's role (attorney tasks: attorney of record and principal) | Daily until done |

- **Where staff see them:** a "Follow-ups" card on "My work"; overdue tasks are marked red in "My tasks".
- **Email:** one email per person on business days, from the existing daily job (`/api/cron/escalations`). Matter codes and form names only, never client data.
- **Never twice:** each item is recorded in `followups_sent`; a refused email is retried on the next run. The table is in the CSV export.
- **Reminder emails are not activity:** stalled matters count staff events only, so a reminder email never makes a matter look active.
- **Settings:** `followup.receipt_business_days` and `followup.emails` (On/Off) on the Settings page.
- **Code:** rules in `src/lib/followups.ts` (unit tests in `followups.test.ts`); migration `20261110000100_followups.sql` (tests in `supabase/tests/followups.test.sql`).

# 4. Decisions for Frank's final review

| # | Decision | Recommendation |
|---|---|---|
| D11 | Client updates send by themselves? | No for the pilot: Outbox plus Send button |
| D22 | Billing tool | LawPay (with QuickBooks if the firm already uses it) |
| D23 | Fee schedule per matter type | Frank supplies it; stored as settings, changed without a developer |
| D9 | Real client emails in UOA OS | Needed before Steps 2–4 use real clients |
