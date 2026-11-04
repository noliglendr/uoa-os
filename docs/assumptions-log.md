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
| 6 | Oct 21, 2026 | A motion or appeal on the same decision stays in the matter if the retainer covers it | Redline item 5 | Move to the new-matter path | Confirmed (decision #9) |
| 7 | Oct 21, 2026 | Routine status updates can go to clients from approved templates (later) | Redline item 13; setting `client_auto_updates` = false for prototype and pilot | Keep auto-updates off | Confirmed for D3 (#9); D11 still pending, default off |
| 8 | Oct 21, 2026 | Deadline windows in the framework are correct as written; new rows are marked "verify" | `attorney_verified` flag on every rule | Attorney corrects before use | Pending D7 |
| 9 | Oct 29, 2026 | The first build is the Matter Tracker with Deadline Control | Setup work only (repo, auth, roles, event log, settings); no feature code | Setup is still reused by any first build | Confirmed (#7) |
| 10 | Oct 29, 2026 | Platform is Next.js + Supabase (Postgres) on Vercel, U.S. region | Create the projects on free/starter plans | Move to the chosen platform; little lost | Confirmed (#8) |
| 11 | Oct 29, 2026 | Roles are Principal, Attorney, Paralegal, Docketing (Intake if needed) | These four roles in the auth setup | Add or rename roles | Confirmed (#10) |
| 12 | Oct 29, 2026 | BIA appearances use Form EOIR-27 | EOIR-27 in the appearance form list | Change one list value | Confirmed (#12) |
| 13 | Oct 29, 2026 | Tool spend stays on free/starter plans until the budget is approved | $0 new monthly spend | None | Confirmed (#11) |
| 14 | Nov 3, 2026 | Who does docketing is not named yet | The principal assigns the Docketing role when creating accounts; reminders also go to the principal | Assign the role to the named person | Open, not blocking |
| 15 | Nov 3, 2026 | Matter stages 7–10 move when **every** filing on the matter reaches that point; each filing also shows its own stage | Matter advances only when all filings pass the check | Change the stage checks | Open, not blocking |
| 16 | Nov 3, 2026 | When non-attorney staff log a notice with no deadline, the system creates an "attorney review" deadline due the next business day, so rule R1 still holds | Attorney then sets a deadline or records "no deadline" | Change the routing | Open, not blocking |
| 17 | Nov 3, 2026 | Records are never deleted in the app; mistakes are fixed by a new change, which is logged | No delete in the app | Add a delete with attorney approval | Open, not blocking |
| 18 | Nov 3, 2026 | Escalation emails go to the attorney of record, the principal and every active Docketing user | Setting `escalation.recipients` | Change the setting (D12) | Pending D12 |
| 19 | Nov 3, 2026 | A matter is "stalled" when nothing has been logged on it for 14 days | Setting `dashboard.stalled_days` = 14 | Change the number | Open, not blocking |
| 20 | Nov 3, 2026 | Until the firm's email domain is verified in Resend, reminders are sent from Resend's test address, which only delivers to the developer's own inbox. `escalation.recipients` is set to `["attorney_of_record"]` meanwhile, because one address Resend can't deliver to stops the whole email (refused emails are retried each day) | Firm domain verified in Resend; `EMAIL_FROM` set to a firm address; `escalation.recipients` set back to D12 | Verify the domain sooner | Open: before the pilot |
