---
title: "Deadline Rules for Attorney Verification (D7)"
subtitle: "Every rule the system will use to compute a deadline, for one review before live use"
---

# 1. What I need from you

The system computes deadlines from these rules. **Nothing is relied on until you verify it.**

For each row, please mark one of:

- **OK**: the rule is right as written.
- **Change**: write the correct rule in the "Your notes" column.
- **Per matter**: the rule depends on the facts, so you will set the date yourself on each matter.

You can reply in this document, or on a call, and I will record your answers. Due: **before live use (Nov 25)**.

**This is a draft for your review, not legal advice.** I wrote it from the framework, the redline, and the regulations as I understand them. The citations are there to speed up your check. Where I was unsure, the row says **"Verify"**.

# 2. How the system uses these rules

- **The date on the notice wins.** When a notice gives a due date (RFE, NOID, appointments), staff enter that date. The rule only checks it and flags a mismatch.
- **Every deadline shows a status:** *Not verified* (rule not yet checked by you), *Verified*, or *Set by attorney* (you entered the date for this matter).
- **Mailing extension:** a toggle on each deadline. When on, it adds 3 days (setting `deadline.mailing_extension_days`). It only applies to rules marked "Yes" below.
- **Weekends and holidays:** if a computed date falls on a weekend or federal holiday, the system shows the next business day **and** the raw date, and tells staff to file by the earlier one.
- **Received, not sent:** for USCIS and EOIR, a filing counts when it is **received**, not when it is mailed. The system's "file by" date is the due date; staff plan mail time on top of it.
- **Reminders:** you and the backup are reminded at 21, 14, 7, 3 and 1 days before each deadline (setting `deadline.escalation_days`).

# 3. The rules

## 3.1 USCIS

| # | Event | Rule (window) | Starts from | Mailing +3 | Source (to check) | Status | Your notes |
|---|---|---|---|---|---|---|---|
| U1 | RFE response | Date on the notice. Maximum 12 weeks. No extensions. | Notice date | No: use the date on the notice | 8 CFR 103.2(b)(8)(iv) | Not verified | |
| U2 | NOID response | Date on the notice. Maximum 30 days. | Notice date | Yes, if the notice was mailed and does not already show a date | 8 CFR 103.2(b)(8)(iv); 8 CFR 103.8(b) | Not verified | |
| U3 | I-290B appeal (AAO) | 30 days | Decision date (service of the decision), **not** the date received | Yes (30 + 3 = 33) | 8 CFR 103.3(a)(2)(i); 8 CFR 103.8(b) | Not verified | |
| U4 | I-290B motion to reopen or reconsider | 30 days | Decision date | Yes (30 + 3 = 33) | 8 CFR 103.5(a)(1)(i); 8 CFR 103.8(b) | Not verified | Late motion to reopen may be excused at USCIS's discretion. Treat 30 days as the deadline. |
| U5 | Biometrics appointment | Date on the notice. Prep task 14 days before. Reschedule request before the date. | Notice | No | Notice | Not verified | |
| U6 | USCIS interview | Date on the notice. Prep task 14 days before. | Notice | No | Notice | Not verified | |
| U7 | I-751 (remove conditions) | Window opens 90 days before, and closes on, the 2nd anniversary of conditional residence. Client duty: listed in the closing letter. | Date conditional residence began | No | INA 216(d)(2); 8 CFR 216.4(a) | Not verified | |

## 3.2 Immigration court (EOIR, Immigration Judge)

| # | Event | Rule (window) | Starts from | Mailing +3 | Source (to check) | Status | Your notes |
|---|---|---|---|---|---|---|---|
| E1 | Motion to reopen | 90 days. One motion. | Final administrative order | No | INA 240(c)(7)(A), (C)(i); 8 CFR 1003.23(b)(1) | Not verified | Exceptions (lack of notice, in absentia rescission, changed country conditions, others): **attorney sets the date per matter**. |
| E2 | Motion to reopen an in absentia order (exceptional circumstances) | 180 days | Date of the in absentia order | No | INA 240(b)(5)(C)(i); 8 CFR 1003.23(b)(4)(ii) | Not verified | Lack of notice: no time limit. Attorney sets per matter. |
| E3 | Motion to reconsider (IJ) | 30 days. One motion. | Final administrative order | No | INA 240(c)(6)(A), (B); 8 CFR 1003.23(b)(1) | Not verified | Framework says "verify". |
| E4 | DHS response to a motion | 10 days | Court receives the motion | No | Immigration Court Practice Manual, ch. 3 (Verify) | Not verified | Used to track when the IJ may rule. |
| E5 | Hearing (master or individual) | Date on the hearing notice. Prep task 14 days before. | Notice | No | Notice | Not verified | Filing deadlines before a hearing (for example, 15 days before for non-detained) may be added as separate rules if you want them. |

## 3.3 Board of Immigration Appeals (BIA)

| # | Event | Rule (window) | Starts from | Mailing +3 | Source (to check) | Status | Your notes |
|---|---|---|---|---|---|---|---|
| B1 | Appeal from an IJ decision (EOIR-26) | 30 days. **Must be received** by the BIA. | IJ oral decision, or the date a written decision was mailed or served | No | 8 CFR 1003.38(b) | Not verified | Escalate early. |
| B2 | Motion to reopen (BIA) | 90 days. One motion. | Final administrative order | No | 8 CFR 1003.2(c)(2) | Not verified | Exceptions: attorney sets per matter. |
| B3 | Motion to reconsider (BIA) | 30 days. One motion. | BIA decision | No | 8 CFR 1003.2(b)(2) | Not verified | |
| B4 | Opposing party's response to a motion | 13 days | Service of the motion | No | 8 CFR 1003.2(g)(3) | Not verified | |
| B5 | Brief deadline | Date on the BIA briefing schedule | Briefing schedule | No | Notice | Not verified | |

## 3.4 Federal court

| # | Event | Rule (window) | Starts from | Mailing +3 | Source (to check) | Status | Your notes |
|---|---|---|---|---|---|---|---|
| F1 | Petition for review (circuit court) | 30 days. Strict: generally cannot be extended. | Date of the BIA's final order | No | INA 242(b)(1) | Not verified | Escalate early. A stay request is separate. |

# 4. Rules I left out on purpose

Tell me if you want any of these added:

- Filing deadlines **before** a hearing (evidence and briefs due a set number of days before).
- Visa Bulletin and priority-date tracking.
- Document expiries (EAD, advance parole, passport) as reminders.
- Detained-docket timelines, which are shorter.

# 5. After you verify

1. I set each rule's status to **Verified** (or apply your change) and record the date and your name in the decision log under D7.
2. Any rule still **Not verified** keeps showing a warning on every deadline that uses it.
3. If a rule later changes, the deadline is marked *Not verified* again until you re-check it.
