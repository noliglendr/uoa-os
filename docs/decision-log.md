# Decision Log

Every decision that shapes UOA OS: what was decided, when, and who decided.
Add new rows at the bottom. Never edit or delete an old row. If a decision changes, add a new row that replaces it and mark the old one "Replaced by #N".

**Status values:** Decided, Pending, Replaced by #N

| # | Date | Decision | Decided by | Source | Status |
|---|---|---|---|---|---|
| 1 | Oct 7, 2026 | Phase 1 scope is the immigration practice only. Out of scope: other practice areas, TAC, CiviQ, marketing, and automatic filing to any agency. | Frank (Principal) | Phase 1 memo (`phase1-brief.md`) | Decided |
| 2 | (date) | Gate 0 approved: resilience baseline (monitoring, SSL, runbook). | Frank (Principal) | (email / call) | Decided |
| 3 | Oct 21, 2026 | Matters A, B and a synthetic Matter C are the three walkthrough matters. | Frank (Principal) | `gate1-redline.md`, assumption 1 | Decided |
| 4 | (date) | Gate 1 feedback: "structural issues and proposed changes are useful." The redline itself is formally accepted under D3. | Frank (Principal) | (email / call) | Decided |
| 5 | (date) | Gate 2 proposal sent. Decisions D1–D6 requested by Nov 3, 2026. | Noli (Technical Lead) | `gate2-proposal.md` | Decided |
| 6 | Nov 3, 2026 | Frank delegated the open build decisions: "go ahead and finalize on this project without more referrals to me. I will review your final work and we can make any edits later." Noli decides D1–D6 on the recommendations below; Frank reviews the finished work. | Frank (Principal) | Message to Noli, Nov 3 | Decided |
| 7 | Nov 3, 2026 | D1: build the Matter Tracker with Deadline Control first. | Noli, under #6 | Recommendation | Decided |
| 8 | Nov 3, 2026 | D2: custom web app, plus bought tools for e-signature, payments and forms (later increments). | Noli, under #6 | Recommendation | Decided |
| 9 | Nov 3, 2026 | D3: Gate 1 redline accepted as proposed (all 14 changes). | Noli, under #6 | Recommendation | Decided |
| 10 | Nov 3, 2026 | D4: roles are Principal, Attorney, Paralegal, Docketing (plus Intake). The principal assigns people to roles when accounts are created; the docketing person is named at setup. | Noli, under #6 | Recommendation; assumption 14 | Decided |
| 11 | Nov 3, 2026 | D5: tool spend up to $150/month without asking. | Noli, under #6 | Recommendation | Decided |
| 12 | Nov 3, 2026 | D6: BIA appearances use Form EOIR-27 (EOIR-28 for the immigration court). Built that way; listed for Frank's final review. | Noli, under #6 | Recommendation; 8 CFR 1003.38(g), 1003.17 | Decided |
| 13 | Nov 3, 2026 | Schedule compressed: Increment 1 finished for Frank's review this week (Fri Nov 6), instead of Nov 17. Frank asked to close the matter this week. | Noli (Technical Lead) | Message from Frank, Nov 3 | Decided |
| 14 | Nov 3, 2026 | D7 (deadline rules) and D9 (real client data) are **not** delegated: they need the attorney himself. Until Frank verifies, every rule shows "Not verified" and only synthetic data is used. D8, D10, D11, D12 run on the safe defaults below until Frank's review. | Noli (Technical Lead) | CLAUDE.md rules 2 and 6 | Decided |
| 15 | Nov 4, 2026 | Interface update before Increment 2: "sidebar workspace" style (left menu, a "My work" list with approve buttons on the dashboard, matter page with a summary panel and tabs, plain-English history, confirm boxes for permanent actions, phone-friendly). Look only: rules, approvals and history unchanged. Built Nov 4 at Noli's request, so Frank reviews the new interface on Nov 6. Order after that: Increment 2 (documents), AI drafting, automation, full dashboard. | Noli (Technical Lead) | Options A/B/C compared; B recommended | Decided |
| 16 | Nov 4, 2026 | New **Administrator** role for the technical lead: manages staff and settings, sees staff emails and two-step status, does day-to-day work; **never** approves a stage, verifies a deadline or rule, records "no deadline", closes or declines a matter, or exports client data; never gives, changes or removes the Principal or Attorney role (only the principal does). Nobody changes their own role or access. Enforced in the database (`profiles_guard`, policies) and tested (`supabase/tests/admin.test.sql`). Noli's account moves from Principal to Administrator, so only the attorney approves (rule 3). | Noli (Technical Lead) | Rule 3: the attorney approves; Noli's request | Decided |
| 17 | Nov 4, 2026 | Role views: the menu shows only the pages a role uses (Staff and Settings: principal and administrator; Export: attorney and principal; Weekly sweep: not Intake). "My work" opens on each role's own work (attorney: approvals; administrator: staff and two-step status; paralegal and docketing: tasks, evidence to collect, sweep due; intake: matters at stage 1). **Intake** only opens matters, records conflict checks and moves a matter from stage 1 to 2; the database refuses anything else (`block_intake`, `matters_intake_limit`, tested in `supabase/tests/roles.test.sql`). | Noli (Technical Lead) | Noli's request | Decided |
| 18 | Nov 4, 2026 | Staff can be **edited** from the Staff page: correct a name, give a new temporary password, reset two-step sign-in (new or lost phone). Each is confirmed and logged (`user.updated` with old and new name, `user.password_reset`, `user.mfa_reset`). Same limits as roles: not yourself, and the Principal and Attorneys only by the principal. Staff are never deleted: access is switched off instead (assumption 17). | Noli (Technical Lead) | Noli's request | Decided |
| 19 | Nov 4, 2026 | Staff accounts with **no activity** (a mistake or a test) can be removed from the Staff page (Edit → Remove): profile and login deleted, removal logged (`user.removed`). Anyone referenced by any record (history, approvals, notices, deadlines, tasks, attorney of record) can't be removed: the database refuses, and access is switched off instead. Refines assumption 17 for staff accounts only; workflow records are still never deleted. | Noli (Technical Lead) | Noli's request | Decided |
| 20 | Nov 5, 2026 | Fixing mistakes on a matter: each party, filing, notice, deadline and checklist row has **Edit** (listed fields only, while the matter is open; the old value stays in History) and **Entered in error** (with a reason: the row leaves the lists, exit and closure checks, reminders and dashboard, but stays in the record, History and the export; it can't be undone or changed). Its deadlines and tasks leave with it. Attorney only for deadlines, filed filings, notices the attorney acted on and attorney-reviewed drafts; a filing with notices or a response, or a party with an open appearance, must be dealt with first. Database: `edit_record`, `mark_entered_in_error`, tested in `supabase/tests/corrections.test.sql`. Records are still never deleted (assumption 17). | Noli (Technical Lead) | Noli's request; keeps rule 4 (append-only record) | Decided |
| 21 | Nov 5, 2026 | One-time clean-up of test data: **Test Matter 1** (a made-up matter from click-testing, taken to closure first) removed with all its records by a script run in the SQL Editor, which stops unless it finds exactly that code. Other test matters are removed the same way when Noli asks. The clean-up is itself logged (`test_data.removed`). The app still never deletes; the same kind of script removes Matters A–C before go-live (with the "Test data" plan). | Noli (Technical Lead) | Noli's request; synthetic data only (rule R5) | Decided |

## Open decisions

Move each one into the table above when the client answers.

### Due Nov 3, 2026 (needed to start the build): all decided Nov 3 under #6

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D1 | Build the Matter Tracker with Deadline Control first | Yes | Decided (#7) |
| D2 | Custom web app, plus bought tools for e-signature, payments and forms | Yes | Decided (#8) |
| D3 | Accept the Gate 1 redline changes | Yes, as proposed | Decided (#9) |
| D4 | Users and roles; who checks mail and notices today | Principal, Attorney, Paralegal, Docketing; name the docketing person | Decided (#10) |
| D5 | Monthly tool budget without asking | Up to $150/month | Decided (#11) |
| D6 | BIA appearances use Form EOIR-27 | Confirm | Decided (#12) |

### Due Nov 25, 2026 (needed before live use)

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D7 | Deadline rules verified by the attorney | Attorney verifies each rule in the app (Deadline rules page); unverified rules are flagged | Pending: Frank only |
| D8 | Retention period for closed files | 7 years; never auto-deleted | Pending |
| D9 | Real client data in the pilot | Yes, after the security checklist passes; open matters only | Pending: Frank only |
| D10 | Staff access to the attorney's USCIS and ECAS accounts | No; staff prepare, the attorney submits | Pending |
| D11 | Automatic status messages to clients | Off for the pilot | Pending |
| D12 | Who receives deadline reminders | Attorney and docketing person, plus a named backup | Pending |
