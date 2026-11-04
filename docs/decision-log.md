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
