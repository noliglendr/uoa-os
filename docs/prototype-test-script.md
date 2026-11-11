---
title: "Prototype Test Script"
subtitle: "Milestone: Prototype, Nov 17, 2026"
---

# How to use this script

**Goal (Gate 2 milestone):** Matters A, B and C run end to end; every notice has a deadline; reminders fire; "where am I needed" takes under 1 minute; export works. Plus the features built since: client documents, Client outbox, invoices, Firm dashboard and AI drafts.

- **Where:** https://uoa-os.vercel.app, signed in as the **Test Principal** (it approves, like Frank).
- **Data:** Matters A, B and C and made-up files only. Never type a real name, number or fact.
- **How:** do each step in order. Tick **Pass** when you see what "Expect" says. If not, tick **Fail**, take a screenshot, write a note, and go on.
- **Every step is logged.** At the end, each matter's **History** tab should show all of it.
- **Time:** about 2–3 hours. You can stop and continue later; the system keeps your place.

The **Next step** card on each matter's Overview always says what is missing before the matter can move on. When a step below says "until the Next step card is clear", follow that card.

# 0. Before you start

| # | Do | Expect | Pass | Fail |
|---|---|---|---|---|
| 0.1 | Vercel → uoa-os → Settings → Environment Variables: `ANTHROPIC_API_KEY` is set for Production | Present (if not, AI drafts return the template unchanged: still testable, mark 8.x "dry run") | ☐ | ☐ |
| 0.2 | **Settings:** "AI first drafts" On; "Case facts to the AI" On; "Daily follow-up email" On; "Prepare invoice drafts" On | Each saves with your name | ☐ | ☐ |
| 0.3 | **Templates:** approve every letter template and every client message template (including "Request: upload documents") | All show **Approved** | ☐ | ☐ |
| 0.4 | **Invoices → Fee schedule:** set "Engagement fee" to 1500 and "Filing phase fee" to 2500 for *Petition* and *Application* | Saved; amounts show | ☐ | ☐ |
| 0.5 | Open **Matter A, B, C**. Note the stage of each | A at stage 8 (RFE response open), B at stage 3, C at stage 8. If one has moved, start that matter's section from where it is | ☐ | ☐ |

# 1. "Where am I needed" (under 1 minute)

| # | Do | Expect | Pass | Fail |
|---|---|---|---|---|
| 1.1 | Start a timer. Open **My work** | "Needs your approval" lists Matter B's strategy approval, Matter A's expert letter, deadlines to verify | ☐ | ☐ |
| 1.2 | Find the next deadline and the urgent matter | "Next 30 days" shows dates; Matter B has the red **Urgent** badge. Stop the timer: under 60 seconds | ☐ | ☐ |
| 1.3 | Verify one deadline from My work (**Verify**) | Confirm box; the item leaves the list; the deadline shows a green check | ☐ | ☐ |

# 2. Rules the system must enforce

| # | Do | Expect | Pass | Fail |
|---|---|---|---|---|
| 2.1 | Matter B → Overview: look at **Move to stage 4** | Disabled until the strategy is approved ("Available when every item on the left is done") | ☐ | ☐ |
| 2.2 | Matter C → Overview: try **Approve closure** | Disabled: the closure checklist shows open deadlines and undecided filings (R4) | ☐ | ☐ |
| 2.3 | Matter A → Notices → **Log notice**: type *Other*, no deadline, no "no deadline" reason | Saved, and My work shows "Set a deadline or record 'no deadline'" for the attorney (R1) | ☐ | ☐ |
| 2.4 | On that notice, click **No deadline** with a reason | The review item disappears | ☐ | ☐ |

# 3. Matter A: EB-2 NIW petition, RFE response to closure

| # | Do | Expect | Pass | Fail |
|---|---|---|---|---|
| 3.1 | Filings & responses → the RFE response: the expert letter is a **third-party draft**. Set it to **Approved** (attorney only) | Saved with your name ("Reviewed by") | ☐ | ☐ |
| 3.2 | Mark the response's other checklist items **Received** or **Drafted** | The response's exit checks turn green | ☐ | ☐ |
| 3.3 | **Drafts** tab → Make draft → **RFE / NOID response outline** → the RFE response → issues: "Evidence of the national importance of the proposed endeavor" and "Evidence the petitioner is well positioned to advance it" → Make draft | A window with one section per issue, evidence from the checklist, **[ATTORNEY TO WRITE ARGUMENT]** kept, due date and exhibit list filled. No legal argument | ☐ | ☐ |
| 3.4 | **Save draft**, then approve it on the Drafts tab | Shows "What staff gave the AI"; status **Approved**; **Copy text** works | ☐ | ☐ |
| 3.5 | Move the response to stage 5, approve **Lock packet**, move to 6, approve **Approve and sign filing**, then **Record response filed** | Each approval asks to confirm; the response shows **Filed**; its RFE deadline is **Met** | ☐ | ☐ |
| 3.6 | Invoices | An invoice draft for the response appears only if a "Response filed" fee phase exists (none by default: expected none) | ☐ | ☐ |
| 3.7 | Notices → **Log notice**: *Decision*, filing I-140 | The attorney gets a same-day review task | ☐ | ☐ |
| 3.8 | Filings → I-140 → **Record decision**: Approved | Matter moves to stage 9; My work shows "Tell the client" (red) | ☐ | ☐ |
| 3.9 | **I told the client** | The red item disappears; logged with your name | ☐ | ☐ |
| 3.10 | **Record next step**: Approval delivered to client; move the matter to stage 10 | Stage 10 | ☐ | ☐ |
| 3.11 | Close the open deadlines (**Met**/**Cancel**), close the G-28 appearance (**Close**), **Record: closing letter sent** | Every closure check is green | ☐ | ☐ |
| 3.12 | **Approve closure** | Matter A is **Closed**; History and export stay available | ☐ | ☐ |

# 4. Matter B: EOIR motion to reopen, strategy to closure, with client documents

| # | Do | Expect | Pass | Fail |
|---|---|---|---|---|
| 4.1 | Overview → **Approve strategy memo and deadline calendar** | Approved; **Move to stage 4** turns on | ☐ | ☐ |
| 4.2 | Move to stage 4 (Evidence build) | Stage 4 | ☐ | ☐ |
| 4.3 | Evidence → Client documents → tick "Client declaration" → due date in 7 days → **Create upload link** | Email text with the link, and a 6-digit code, shown once | ☐ | ☐ |
| 4.4 | Open the link in a **private window**. Enter a wrong code | "That code is not right" | ☐ | ☐ |
| 4.5 | Enter the right code. Upload a made-up PDF (any test file) | "Received. Thank you." | ☐ | ☐ |
| 4.6 | Try uploading a .txt file renamed to .pdf | Refused: "not a PDF, JPG, PNG or HEIC file" | ☐ | ☐ |
| 4.7 | Back on Matter B → Received files → **Open** | The file downloads with the item's name, not the original file name | ☐ | ☐ |
| 4.8 | **Reject** it with "Page 2 is missing". Reload the private window | The client page shows the reason; the item is "Requested" again | ☐ | ☐ |
| 4.9 | Upload again; **Accept** it. Click **Download all (ZIP)** | Item **Received**; the ZIP opens with both files (rejected one in "Rejected") | ☐ | ☐ |
| 4.10 | **Drafts** → **Statement draft** → Who speaks: Client 1 → facts: three made-up lines with role words only | First-person paragraphs from those facts only; **[ASK THE CLIENT: …]** where facts are missing; nothing invented | ☐ | ☐ |
| 4.11 | Mark the other checklist items done, move to 5, **Lock packet**, move to 6 | Stage 6 | ☐ | ☐ |
| 4.12 | Parties → add an **EOIR-28** appearance for Client 1. Filings → **Add filing**: Motion to reopen, Immigration court. **Approve and sign filing**, then **Mark filed** | Filing filed; follow-up "Receipt not logged" appears on My work after 1 business day (see 6.3) | ☐ | ☐ |
| 4.13 | Log a **Hearing** notice on the filing with an appointment deadline in 30 days | Deadline created; the attorney gets a same-day review task; **no** Client outbox message (hearings go to the attorney) | ☐ | ☐ |
| 4.14 | Mark the motion deadline (90 days) **Met**; the hearing **Attended**; record the decision (*Granted*), tell the client, next step *Nothing further*; move to 10 | Stage 10 | ☐ | ☐ |
| 4.15 | Close the EOIR-28 appearance, closing letter sent, **Approve closure** | Matter B **Closed** | ☐ | ☐ |

# 5. Matter C: spousal adjustment bundle (4 filings, 2 clients)

| # | Do | Expect | Pass | Fail |
|---|---|---|---|---|
| 5.1 | Notices → **Log notice**: *Biometrics* on the I-485, with an appointment date in 20 days. Then open **Client outbox** | An "Update: appointment scheduled" message with the date filled and **[CLIENT NAME]** blank (the seeded notices came before the templates were approved, so they have none) | ☐ | ☐ |
| 5.2 | **Copy text** → choose "Email" → **Mark sent** | Moves to "Sent or cancelled", with your name | ☐ | ☐ |
| 5.3 | Change that appointment's date (Deadlines → edit) | The old message is cancelled ("The appointment date changed") and a new one appears | ☐ | ☐ |
| 5.4 | Mark biometrics and interview **Attended** | Deadlines show **Met** | ☐ | ☐ |
| 5.5 | Record a decision on each of the 4 filings (Approved); tell the client for each | 4 decisions; each red "Tell the client" item cleared | ☐ | ☐ |
| 5.6 | Next step on the I-485: *Approval delivered to client*. Move to stage 10 | Stage 10 | ☐ | ☐ |
| 5.7 | Close both G-28 appearances, close any open deadlines, closing letter sent, **Approve closure** | Matter C **Closed** | ☐ | ☐ |

# 6. Reminders and follow-ups

| # | Do | Expect | Pass | Fail |
|---|---|---|---|---|
| 6.1 | On a **business day**, Vercel → Settings → Cron Jobs → **Run** `/api/cron/escalations` | Runs without error | ☐ | ☐ |
| 6.2 | Check your inbox (Resend test mode delivers to you only) | Deadline reminders (21/14/7/3/1 days) and one "[UOA OS] N follow-ups for <date>" email | ☐ | ☐ |
| 6.3 | **Run** again the same day | No repeat emails | ☐ | ☐ |
| 6.4 | Settings → "A matter is stalled after" = 1 → My work | Follow-ups lists stalled matters. **Set it back to 14** | ☐ | ☐ |
| 6.5 | Client outbox → **Check for follow-ups now** (with a client item "Requested" over 7 days, or the setting set to 0) | "Follow-up: documents still needed" listing the items. Reset the setting to 7 | ☐ | ☐ |

# 7. Invoices, Firm dashboard, export, history

| # | Do | Expect | Pass | Fail |
|---|---|---|---|---|
| 7.1 | **Invoices** | Drafts from the engagement and filing steps you did, with the fee schedule amounts | ☐ | ☐ |
| 7.2 | **Approve** one; type "TEST-1" → **Record as entered**; **Void** another with a reason | Approved → In billing tool; void kept with reason | ☐ | ☐ |
| 7.3 | **Firm dashboard** | Fees billed this month; deadlines met on time; receipts on time; days per stage; approvals; outbox numbers | ☐ | ☐ |
| 7.4 | **Export**: download Matters, Event log, Documents, Invoices, Client outbox | CSV files open in Excel; no links or codes in Documents/requests | ☐ | ☐ |
| 7.5 | Matters A, B, C → **History** | Every step above, with who and when; client uploads show as System | ☐ | ☐ |

# 8. Clean up after the test

| # | Do | Pass |
|---|---|---|
| 8.1 | Settings: **"Case facts to the AI" Off** (it must be off once real data comes in, until Frank decides D9 and D24) | ☐ |
| 8.2 | Settings: "AI first drafts" back to **Off** until Frank decides D21 | ☐ |
| 8.3 | Settings: stalled days **14**, client reminder days **7** | ☐ |

# 9. Result

| | |
|---|---|
| Tested by | |
| Date | |
| Steps passed | ___ of 56 |
| Steps failed (numbers) | |
| Ready for the Nov 17 milestone? | Yes / No |

Send the failed steps with screenshots to the developer. Fixes are made and the failed steps are run again before Nov 17.
