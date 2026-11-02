---
title: "Gate 2 Proposal"
subtitle: "What we build first, how, and when"
---

# 1. Summary

**My recommendation:** build a **Matter Tracker with Deadline Control** first.

It is one screen where you can see every open matter, where it is in the 11 stages, what needs your approval, and which deadlines are coming up. No notice or deadline can slip through.

- **Prototype** (test data only): **November 17**
- **Tested against how the firm really works:** **November 24**
- **Live pilot** (after your approval): **November 30 – December 18**
- **Tool cost:** about **$50–100 per month** for hosting, database and email (not including my fee)

**What I need from you:** 6 decisions by **November 3** (section 5). You can reply "approve all recommendations".

# 2. What we build first, and why

**What it does:**

1. **Opens a matter** at intake, with the conflict check, matter type and urgency.
2. **Moves the matter through the 11 stages**, including the Gate 1 redline fixes.
3. **Stops at your approval points.** Stages 2, 3, 5 and 6 can't move forward until you approve in the system.
4. **Turns every notice into a deadline.** Each receipt, RFE, NOID, biometrics, interview, hearing or order is logged with its due date.
5. **Sends reminders** to you and a backup at 21, 14, 7, 3 and 1 days before each deadline.
6. **Keeps a full history.** Every change shows who made it and when.
7. **Gives you one dashboard:** open matters, your approval queue, deadlines in the next 30 days, and stalled matters.
8. **Exports all data** at any time, so the firm always owns it.

**Why first:**

- **It removes the biggest risk.** A missed deadline is the costliest mistake a firm can make.
- **Everything else builds on it.** The client portal, AI drafting and billing all attach to a matter.
- **Low data risk.** It uses no AI and no client documents, and it can be fully tested on made-up matters.
- **It follows your plan.** It covers "intake and matter opening" from your memo, plus deadline control.

**Later, in your memo's order:** client document collection, then AI drafting, then automated client updates, then the full dashboard. Each comes with its own plan and decision list.

# 3. Platform

| Part | What I'll use | Why |
|---|---|---|
| The core system | **Build:** a web app (Next.js) with a standard database (Postgres, via Supabase), hosted in the U.S. | Your framework's rules are specific to the firm. Ready-made legal software can't enforce your approval points. The data is easy to export. |
| Security | Login with 2-step verification, access by role, encryption, a history that can't be edited, and personal data kept separately | Meets your memo's non-negotiables |
| E-signature and payments (later) | **Buy:** Dropbox Sign or DocuSign; LawPay | Proven tools |
| USCIS forms (later) | **Consider buying:** Docketwise or similar | No need to rebuild form software |
| AI drafting (later) | Chosen later, with a "no training on your data" contract | Not part of this first build |

**Option I don't recommend:** running everything inside one legal software product. It's faster to start, but it can't enforce your approval points or a full history, and you depend on one vendor.

# 4. Dates and how you'll know each step is done

| Step | Date | What you get | It's done when |
|---|---|---|---|
| 1. Your decisions | **Nov 3** | Answers to D1–D6 | Decisions are recorded |
| 2. Foundation | **Nov 10** | Updated framework (v2); matters move through the 11 stages; your approval points; history log | A matter can't pass stages 2, 3, 5 or 6 without your approval, and every change shows who and when |
| 3. Prototype | **Nov 17** | Notices, deadlines, reminders and the dashboard | Matters A, B and C run start to finish; every notice has a deadline; reminders arrive on time; you can see where you're needed in under a minute |
| 4. Real-practice test | **Nov 24** | Test report and fix list | Every step from real past matters fits the system, and the fixes are done |
| 5. Live approval | **Nov 25** | Security checklist; decisions D7–D12 | You approve in writing |
| 6. Pilot | **Nov 30 – Dec 18** | Open matters tracked in the system and the current way, side by side | Over 3 weeks, the system misses nothing the current method catches |

# 5. Decisions I need from you

**By November 3, to start building:**

| # | Decision | My recommendation |
|---|---|---|
| D1 | Build the Matter Tracker with Deadline Control first | **Yes** |
| D2 | Use a custom web app, and buy tools for e-signature, payments and forms | **Yes** |
| D3 | Accept the Gate 1 redline changes | **Yes, as proposed** |
| D4 | Who will use the system, and in what role | Principal, Attorney, Paralegal, Docketing. **Please name who checks mail and notices today.** |
| D5 | Monthly tool budget I can spend without asking | **Up to $150 per month** |
| D6 | Confirm that BIA appearances use Form EOIR-27 | **Confirm** |

**By November 25, before real data is used:**

| # | Decision | My recommendation |
|---|---|---|
| D7 | Check the deadline rules once | You verify each rule. The system marks any rule not yet checked. |
| D8 | How long to keep closed files | **7 years.** Nothing is deleted without your review. |
| D9 | Use real client data in the pilot | **Yes, after the security checklist passes**, open matters only |
| D10 | Staff access to your USCIS and ECAS accounts | **No.** Staff prepare, and you submit. |
| D11 | Automatic status messages to clients | **Off for the pilot**, then on later with templates you approve |
| D12 | Who gets deadline reminders | **You and the docketing person**, plus a named backup |

# 6. How I'll test it against real practice

1. **Run Matters A, B and C** through the prototype and show you.
2. **Re-run 3 recently closed matters** as made-up copies (no names or numbers), and check that every step fits.
3. **Take a 30-minute walkthrough** (a call or a screen recording) with whoever handles mail, the USCIS account and ECAS today.
4. **Run it side by side** with the current method for 3 weeks, then log and fix every difference.
5. **You sign off** before the old method stops.

# 7. Safe for testing, or needs your approval first

| OK for the prototype (no approval needed) | Needs your approval before real use |
|---|---|
| Made-up matters only | Real client data (D9) |
| Default settings | Deadline rules checked by you (D7) |
| Deadline rules as written in your framework | File retention period (D8) |
| Reminders sent to test email addresses | Who gets reminders (D12) |
| You as the only approver | Staff access to your accounts (D10) |
| Starter hosting plans | Security checklist (2-step login, backups, access, vendor terms) |
| No messages to clients | Any automatic client messages (D11) |

# 8. Next step

Please reply with **D1–D6 by November 3**, or simply "approve all recommendations". I'll start building the same day and send you a status update every Friday.
