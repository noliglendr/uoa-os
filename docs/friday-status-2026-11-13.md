# Friday status: November 13, 2026

To send by email to Frank. Draft by Claude for Noli: check it, then send.

---

**Subject:** UOA OS: all parts built and tested; go-live checks next

Frank,

As you asked, I am running the project on my own. Here is where it stands.

**Done this week**
- **Everything in Phase 1 is built and online** (made-up data only):
  - matter tracking with your approvals and deadline control;
  - client document upload (secure link plus a code);
  - AI first drafts of letters, RFE and NOID outlines and statements (switched off until you decide);
  - automatic follow-ups;
  - a client outbox (staff send every message; nothing goes out on its own);
  - invoice drafts;
  - a firm dashboard.
- **Full test in the live system:** three made-up matters taken from intake to closed file, every step logged.
- **Three review rounds** fixed 16 problems before anyone relies on the system. For example:
  - receipt reminders now follow USCIS timing;
  - each fee phase is invoiced once;
  - a court filing needs an EOIR-28;
  - an appeal needs its deadline on the calendar before it can be recorded.
- **Legal hold and the 7-year retention review** are in place. Closed files can't be changed.

**Next**
- **Nov 17 (prototype):** the full test script passed on Nov 11; the reminder emails are being checked now.
- **Nov 24 (real-practice test):** replay three past matters with names removed.
- **Nov 25 (live use):** finish the security checklist (attached).

**Blocked:** nothing. One setup item in progress: the firm's email domain, so reminders reach staff (a short DNS change by whoever manages uoalegal.com).

**Only you can decide (before live use, Nov 25)**
1. **D7: deadline rules.** Open **Deadline rules** and verify each rule.
2. **D9: real client data** in the pilot, after the security checklist.
3. **D17: real client documents** in the upload system.
4. **D21 and D24: AI drafts on real matters**, and whether case facts may go to the AI. Only after you check the Texas and New York bar rules, and after the vendor's no-training terms are signed.

Everything else I decided on my recommendations, as you asked (decision log).

Noli
