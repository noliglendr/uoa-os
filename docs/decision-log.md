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

## Open decisions

Move each one into the table above when the client answers.

### Due Nov 3, 2026 (needed to start the build)

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D1 | Build the Matter Tracker with Deadline Control first | Yes | Pending |
| D2 | Custom web app, plus bought tools for e-signature, payments and forms | Yes | Pending |
| D3 | Accept the Gate 1 redline changes | Yes, as proposed | Pending |
| D4 | Users and roles; who checks mail and notices today | Principal, Attorney, Paralegal, Docketing; name the docketing person | Pending |
| D5 | Monthly tool budget without asking | Up to $150/month | Pending |
| D6 | BIA appearances use Form EOIR-27 | Confirm | Pending |

### Due Nov 25, 2026 (needed before live use)

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D7 | Deadline rules verified by the attorney | Attorney verifies each rule; unverified rules are flagged | Pending |
| D8 | Retention period for closed files | 7 years; never auto-deleted | Pending |
| D9 | Real client data in the pilot | Yes, after the security checklist passes; open matters only | Pending |
| D10 | Staff access to the attorney's USCIS and ECAS accounts | No; staff prepare, the attorney submits | Pending |
| D11 | Automatic status messages to clients | Off for the pilot | Pending |
| D12 | Who receives deadline reminders | Attorney and docketing person, plus a named backup | Pending |
