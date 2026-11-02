# Assumptions Log

What we assume while we wait for an answer, so work never stops.
Rule: log the assumption and keep going. Ask the client only when blocked for more than a day.
When an assumption is confirmed or rejected, update its status and add the matching row to `decision-log.md`.

**Status values:** Open, Confirmed, Rejected, Pending (waiting on a named decision)

| # | Date | Assumption | Default used | Impact if wrong | Status |
|---|---|---|---|---|---|
| 1 | Oct 21, 2026 | Samples A and B, plus a synthetic Matter C, are the three walkthrough matters | As instructed | None | Confirmed by Frank |
| 2 | Oct 21, 2026 | The principal is attorney of record on all matters | Setting `attorney_of_record.default` | Change the setting | Open, not blocking |
| 3 | Oct 21, 2026 | No delegated account access until decided | Setting `delegated_account_access` = off | Turn the setting on | Pending D10 |
| 4 | Oct 21, 2026 | Premium processing decided per matter, default no | Setting `premium_processing` = ask_per_matter | Change the setting | Open, not blocking |
| 5 | Oct 21, 2026 | Retention of 7 years, never auto-deleted | Setting `retention.years_after_close` = 7 | Change the number | Pending D8 |
| 6 | Oct 21, 2026 | A motion or appeal on the same decision stays in the matter if the retainer covers it | Redline item 5 | Move to the new-matter path | Pending D3 |
| 7 | Oct 21, 2026 | Routine status updates can go to clients from approved templates (later) | Redline item 13; setting `client_auto_updates` = false for prototype and pilot | Keep auto-updates off | Pending D3, D11 |
| 8 | Oct 21, 2026 | Deadline windows in the framework are correct as written; new rows are marked "verify" | `attorney_verified` flag on every rule | Attorney corrects before use | Pending D7 |
| 9 | Oct 29, 2026 | The first build is the Matter Tracker with Deadline Control | Setup work only (repo, auth, roles, event log, settings); no feature code | Setup is still reused by any first build | Pending D1 |
| 10 | Oct 29, 2026 | Platform is Next.js + Supabase (Postgres) on Vercel, U.S. region | Create the projects on free/starter plans | Move to the chosen platform; little lost | Pending D2 |
| 11 | Oct 29, 2026 | Roles are Principal, Attorney, Paralegal, Docketing (Intake if needed) | These four roles in the auth setup | Add or rename roles | Pending D4 |
| 12 | Oct 29, 2026 | BIA appearances use Form EOIR-27 | EOIR-27 in the appearance form list | Change one list value | Pending D6 |
| 13 | Oct 29, 2026 | Tool spend stays on free/starter plans until the budget is approved | $0 new monthly spend | None | Pending D5 |
