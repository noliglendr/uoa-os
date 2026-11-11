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
| 2 | **Client updates, prepared not sent**: receipt arrived, biometrics or interview scheduled. A message from an approved template waits in the Client outbox; staff send it and click Mark sent | Approve templates; D11 stays off | Built Nov 11 (decision #29) |
| 3 | **Client follow-ups**: unsigned engagement, requested documents still missing, through the Client outbox | Same as Step 2 | Built Nov 11 (decision #29) |
| 4 | **Invoices**: fee phases trigger an invoice draft; the attorney approves; the billing tool sends and collects | Fee amounts (D23); billing tool (D22, recommended: LawPay) | Built Nov 11 (decision #29); no billing tool connected |

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

# 4. Steps 2 and 3 in detail (Client outbox)

| Message | Prepared when | Notes |
|---|---|---|
| Update: receipt arrived | A filing's receipt is logged | Form name only ("I-130"), never the receipt number |
| Update: appointment scheduled | A biometrics or interview appointment is logged | A new date cancels the old message and prepares a new one. Hearings go to the attorney (redline 8), so they have none |
| Follow-up: engagement not signed | A prospect waits `client_followup.engagement_days` (7) days at stage 2 | Again every 7 days while unsigned; cancelled when the attorney approves engagement |
| Follow-up: documents still needed | Client items stay "requested" for `client_followup.documents_days` (7) days | Lists the items; cancelled when none is still requested |

- **Nothing is prepared** from a template until the attorney approves it (Templates page). Changing the wording needs a new approval.
- **UOA OS fills** [DATE], [ATTORNEY NAME], [FORM TYPE], [APPOINTMENT TYPE], [APPOINTMENT DATE], [ITEM LIST]. **[CLIENT NAME] stays blank** (R5): staff fill it in when they send the message from their own email or phone.
- **Staff send it** (attorney, principal, paralegal, docketing): Copy text, send, choose how (email, phone, mail, portal, in person), Mark sent. Or "Don't send" with a reason. Both are logged and frozen.
- **Follow-ups** are checked by the daily job on business days, or with "Check for follow-ups now" on the Client outbox page. Both run as the system, so they never make a stalled matter look active. A waiting message that is no longer needed (matter closed, engagement signed, documents received, appointment changed) is cancelled by UOA OS.
- **Decisions are never in the outbox**: the attorney tells the client.

# 5. Step 4 in detail (Invoices)

- **Fee schedule** (Invoices page, D23): per matter type, which step reaches a fee phase: engagement signed, strategy approved, filing submitted, response filed, decision recorded, matter closed. Each phase has a name and an optional amount (empty: the attorney enters it on each invoice). Starter phases: "Engagement fee" and "Filing phase fee" for every matter type, with no amounts, until Frank supplies his fees. Only the principal changes it; every change is logged.
- **Invoice draft**: prepared when the step is logged (setting `billing.invoice_drafts`, On). Matter code only, no client details.
- **Attorney**: sets the amount, then Approve (logged). Or Void with a reason.
- **Staff** (attorney, principal, administrator): enter the approved invoice in the billing tool, which sends it and collects payment, then record the tool's invoice number ("Record as entered"). Paralegals and docketing don't see invoices.
- **Code:** migration `20261111000100_outbox_invoices.sql` (tests in `supabase/tests/outbox.test.sql`); pages `/outbox` and `/invoices`.

# 6. Decisions for Frank's final review

| # | Decision | Recommendation |
|---|---|---|
| D11 | Client updates send by themselves? | No for the pilot: Client outbox, staff send and mark sent (built this way) |
| D22 | Billing tool | LawPay (with QuickBooks if the firm already uses it) |
| D23 | Fee schedule per matter type | Frank supplies the amounts; the principal enters them on the Invoices page (no developer) |
| D9 | Real client emails in UOA OS | Not needed for the outbox as built (staff add the client's name and send); needed only if UOA OS should send messages itself later |
