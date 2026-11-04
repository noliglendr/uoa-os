# UOA OS: Increment 1 Review

**For:** Frank (Principal) · **From:** Noli · **Review by:** Friday, November 6, 2026

You asked me to finish without more referrals. This page is the whole review: what is built, a 10-minute tour, and the few items only you can decide.

## 1. What is built

The **Matter Tracker with Deadline Control**, as proposed at Gate 2, with all 14 redline changes:

- Every matter moves through the **11 stages**. A stage cannot be passed until its exit gate is met.
- **Your approval is required** at stages 2, 3, 5 and 6 (also inside each RFE, NOID or motion response). Staff cannot get around it: the database refuses.
- **Every notice gets a deadline**, or your recorded "no deadline". If staff log a notice with no deadline, it lands on your list for the next business day.
- **Reminders** go out at 21, 14, 7, 3 and 1 days before each deadline. If a retainer is not signed by its alert date (for example on an EOIR matter with a running clock), you get an alert.
- **Weekly status sweep:** every pending USCIS case and every EOIR or federal matter is checked online once a week, and the check is recorded.
- **Staff:** you add people, give each a role, and switch access off when someone leaves.
- **Your dashboard** shows where you are needed: approvals, deadlines to verify, drafts to review, decisions to tell clients.
- **Every change is logged** (who, what, when) and nothing can be deleted.
- **Everything exports to CSV** at any time.
- **The system never files, signs or submits anything.** It never tells a client about a decision: you do.

## 2. 10-minute tour

Sign in, with your authenticator app, at: **https://uoa-os.vercel.app**

| Step | Where | What you should see |
|---|---|---|
| 1 | Dashboard | Your sign-off queue: Matter B's strategy approval, Matter A's expert letter, deadlines to verify |
| 2 | Matter A (EB-2 NIW) | Stage 8. An RFE was received; its response runs through stages 4–6 again, with its own approvals |
| 3 | Matter B (motion to reopen) | Stage 3. The 90-day clock was verified at intake, before engagement. Click **Approve strategy memo** |
| 4 | Matter C (spousal bundle) | Two clients, four filings, each with its own receipt. Biometrics and interview are on the calendar with prep tasks |
| 5 | Any matter → History | Every step, with who and when |
| 6 | Deadline rules | The 18 rules, each **Not verified** until you check it |

Matters A, B and C use made-up data only.

## 3. What only you can decide

| # | Item | What I did meanwhile | What I need |
|---|---|---|---|
| D7 | **Deadline rules** | All 18 rules are in the app, marked "Not verified". Every deadline built on an unverified rule shows a warning | Open **Deadline rules** and click **Verify** on each rule that is right. Write a note on any that is wrong. Before live use (Nov 25) |
| D9 | **Real client data** | Synthetic data only | Yes or no to real (open) matters in the pilot, after the security checklist |
| D6 | EOIR-27 for the BIA | Built as EOIR-27 (EOIR-28 for the immigration court) | Tell me only if this is wrong |
| D8, D10–D12 | Retention 7 years; no staff access to your USCIS/ECAS accounts; no automatic client messages; reminders to you, the principal and docketing | Set as the defaults (you can change them in **Settings**) | Tell me only if you want a change |
| D4 | Who does docketing | The role exists; it is given when the account is created | The name of the person |

Everything I decided under your delegation is in `docs/decision-log.md` (entries #6–#14).

## 4. Not in this increment

AI drafting, the client portal, document upload, e-signature, payments, USCIS form-filling and client messages, as agreed at Gate 2.

## 5. After your review

1. I make your edits.
2. **Real-practice test:** I replay past matters (no real names) to check they fit.
3. **Live-use approval (Nov 25):** security checklist, plus your D7 and D9.
4. **Pilot (Nov 30 – Dec 18):** run alongside the current method. Nothing it catches may be missed.
