# UOA OS: Project Context for Claude Code

Read this file first. It holds everything decided so far. The source documents are in `docs/`.

## 1. What this project is

**UOA OS** is an internal "firm operating system" for **UOA Legal**, an immigration law firm (Frisco, TX and New York, NY). Every immigration matter is tracked from first inquiry to closed file. The attorney approves every key step, and no deadline is missed.

- **Client / principal:** Frank (Udoka Obie Amah), the attorney and the firm's principal. He makes legal, money and approval decisions only.
- **Technical lead:** Noli (the developer using this repo). Noli owns planning, recommendations, follow-through and Friday status updates. **Never design the work by asking the client "what next?"** Bring a plan and one decision list at each gate.
- **Phase 1 scope:** the immigration practice only. Out of scope: other practice areas, TAC, CiviQ, marketing, and any automatic filing to USCIS or other agencies.

## 2. Where we are (gates)

| Gate | Status |
|---|---|
| Gate 0: Resilience baseline (monitoring, SSL, runbook) | Approved |
| Gate 1: Process map | Client wrote the 11-stage **Matter Lifecycle Framework** (`docs/matter-lifecycle-framework.pdf`). Noli sent a redline (`docs/gate1-redline.md`). Client: "structural issues and proposed changes are useful." |
| Gate 2: Proposal | **Approved Nov 3 by delegation**: Frank asked Noli to finalize without more referrals and review the final work. D1–D6 decided on the recommendations (decision log #6–#12). |
| Gate 3: Build | Increment 1 (Matter Tracker with Deadline Control) built Nov 3–4; Frank's review of the finished work due **Fri Nov 6** (decision #13). Review guide: `docs/increment1-review.md`. |

## 3. Non-negotiable rules

1. **No real personal data** in code, tests, seed data, tickets, logs or commits: no client names, A-numbers, receipt numbers, dates of birth, addresses, employers or case facts. Use "Matter A/B/C" and role labels only.
2. **Dev and test use synthetic data only** (framework rule R5). Personal data, when allowed later, lives in a separate encrypted store, and workflow logic uses synthetic matter IDs.
3. **The attorney approves; the system never acts for the attorney.** It routes work to an approval gate and blocks progress. It never files, signs or submits anything itself.
4. **Every stage change is a logged event** with owner (user) and timestamp. "If it is not logged, it did not happen." The event log is append-only.
5. **Open decisions are settings, not hard-coded values** (section 8).
6. **Deadline rules are configuration.** Each computed deadline has an `attorney_verified` flag and a mailing-extension toggle.
7. **The firm owns its data.** Everything must be exportable (CSV) at any time.
8. **Security:** login with MFA, role-based access (Postgres row-level security), encryption in transit and at rest, and secrets only in environment variables (never committed).

## 4. The 11-stage lifecycle (the spine)

Every matter type (petition, application, EOIR litigation, federal) uses the same stages. Only forms, forum and deadlines change.

| # | Stage | Exit gate (must be true to advance) | Owner | Event |
|---|---|---|---|---|
| 1 | Intake and conflicts | Conflict check cleared; matter typed (petition / application / EOIR litigation / federal); urgency flag set | Intake, then Attorney | `matter.created` |
| 2 | Engagement | Signed retainer; scope, fee phases, responsibilities recorded | **Attorney only** | `engagement.signed` |
| 3 | Strategy and eligibility | Attorney memo (pathway, risks, evidence plan); deadline calendar built and attorney-verified | **Attorney only** | `strategy.approved` |
| 4 | Evidence build | Every checklist item has an owner (client / firm / third party) and a status; all received or drafted | Paralegal, client | `evidence.complete` |
| 5 | Review and sign-off | Final legal review; signatures collected; packet locked | **Attorney only** | `packet.locked` |
| 6 | Appearance and filing | G-28 / EOIR-28 / EOIR-27 filed with packet; method, fee, proof of filing or service captured | Filing clerk; attorney signs | `filing.submitted` |
| 7 | Receipt and monitoring | Receipt logged within 1 business day; tracking and deadlines on | Docketing | `receipt.logged` |
| 8 | Agency action | RFE / NOID / biometrics / interview / hearing / order logged, calendared, routed the same day | Docketing, then Attorney | `notice.received` |
| 9 | Decision | Outcome logged; the attorney (not the system) tells the client | Attorney | `decision.recorded` |
| 10 | Post-decision | Approval delivered, or a motion / appeal / refile decision with a hard deadline | Attorney | `postdecision.opened` |
| 11 | Closure | Closure checklist complete; closing letter sent | Attorney approves | `matter.closed` |

**Attorney gates:** stages 2, 3, 5 and 6 cannot advance without an attorney approval record (rule R3).

## 5. Redline changes to build in (from Gate 1)

These change the data model. Build them as proposed unless the client marks them otherwise.

1. **Response cycles:** stages 4 → 5 → 6 can repeat inside one matter (RFE, NOID, I-290B and motion responses). Each cycle has its own attorney gates.
2. **Several filings per matter:** stages 6–10 are tracked **per Filing** (own receipt, deadlines, decision). A matter reaches stage 11 only when every filing is decided.
3. **Early deadlines:** for EOIR, federal or hard-deadline intakes, the attorney verifies the deadline at stage 1, before engagement. Escalate if engagement isn't signed by an alert date.
4. **Several clients per matter** (e.g. petitioner + beneficiary): conflicts per party, joint-representation consent at stage 2, and appearances per client.
5. **Same matter versus new matter:** a motion or appeal on the same decision stays in the matter (if the retainer covers it). A refile or the next phase (adjustment, merits case) opens a **new** matter (setting `next_phase_new_matter`).
6. **Appearance forms:** G-28 for USCIS / CBP / ICE; **EOIR-28 for the immigration court; EOIR-27 for the BIA**; a circuit court petition for review needs that court's own appearance.
7. **Appearance transfer:** an open appearance can be transferred to a successor matter (logged event). R4 checks for appearances that are open and not transferred.
8. **Notice routing by type:** RFE, NOID, decisions, hearings and interviews go to the attorney the same day. Biometrics and receipts go to docketing/paralegal and the client, with the attorney informed.
9. **Status sweep:** a weekly sweep covers USCIS receipts **and** EOIR matters.
10. **Appointments** are a deadline type (biometrics, interview, hearing): date, who must attend, a prep task (e.g. 14 days before), and a reschedule request.
11. **Prospect and declined states** before engagement (assessment letter with a no-relationship disclaimer; non-engagement letter on decline).
12. **Third-party drafts** (expert or employer letters) get an attorney review inside stage 4, before they go out for signature.
13. **Client updates:** decisions are told by the attorney only. Routine template-approved updates (receipt arrived, biometrics scheduled) may be automatic later. **Off in the prototype and pilot.**
14. **Client duties** recorded in the strategy memo: travel advisory, AR-11 address change within 10 days.

## 6. Data model

Entities: **Matter, Party** (role only in the workflow DB), **MatterClient, Appearance** (form, forum, client, status, transferred_to), **Filing** (form type, forum, receipt/ref no., status, decision), **ResponseCycle, Notice** (channel, type, received_at, logged_at, filing), **Deadline** (type: response or appointment; trigger date, rule, computed due date, attorney_verified, mailing_extension), **Task** (owner role), **Gate** (attorney approval, approver, timestamp), **Document** (metadata), **ChecklistItem, EventLog** (append-only), **Setting**.

Rules:

- **R1:** a logged notice must create a Deadline or an attorney-recorded "no deadline" flag.
- **R2:** deadlines escalate to the attorney and backup at 21, 14, 7, 3 and 1 days.
- **R3:** stages 2, 3, 5 and 6 can't advance without an attorney gate approval (also inside each response cycle).
- **R4:** a matter can't close with an open deadline or an open, non-transferred appearance.
- **R5:** personal data is kept in an isolated, encrypted store. Workflow uses synthetic IDs. Dev and test never contain real data.

Roles: **Principal, Attorney, Paralegal, Docketing** (plus Intake, if needed).

## 7. Deadline reference (configure; the attorney verifies before live use)

| Event | Typical window |
|---|---|
| USCIS RFE response | Fixed date on the notice (up to 12 weeks) |
| USCIS NOID response | 30 days (+3 if mailed); the date on the notice controls |
| Form I-290B | 30 days from decision (+3 if mailed) |
| EOIR motion to reopen | Generally 90 days from final order; one motion; exceptions set by the attorney per matter |
| IJ motion to reconsider | 30 days from the order (verify) |
| BIA appeal from an IJ decision | 30 days |
| Circuit court petition for review | 30 days from the BIA order |
| Biometrics / interview / hearing | Appointment date on the notice |
| I-751 (conditional residence) | 90 days before the 2nd anniversary; client duty listed in the closing letter |
| DHS response to a motion in immigration court | Verify |

## 8. Settings (defaults)

| Key | Default |
|---|---|
| `attorney_of_record.default` | The principal on every matter (override per matter) |
| `delegated_account_access` | `off` (staff prepare, the attorney submits); options: off / prepare_only / submit_after_gate |
| `premium_processing` | `ask_per_matter`, default no |
| `retention.years_after_close` | 7; never auto-delete; flag for attorney review; legal hold blocks |
| `next_phase_new_matter` | true |
| `deadline.mailing_extension_days` | 3 |
| `deadline.escalation_days` | [21, 14, 7, 3, 1] |
| `client_auto_updates` | false |

## 9. Increment 1: Matter Tracker with Deadline Control

Build only after the client approves Gate 2.

1. Open a matter at intake (conflict-check record, matter type, urgency).
2. Move matters through stages 1–11, with the redline changes.
3. Attorney approval gates at stages 2, 3, 5 and 6.
4. Notice log, with each notice creating a deadline or a "no deadline" flag.
5. Escalation emails at 21/14/7/3/1 days.
6. Event log (who, what, when) for every change.
7. Principal dashboard: open matters by stage, sign-off queue, deadlines in the next 30 days, stalled matters.
8. CSV export of all data.
9. Seed data: Matters A, B and C (synthetic; see `docs/gate1-redline.md`).

**Not in Increment 1:** AI drafting, the client portal, document upload, e-signature, payments, USCIS form-filling, and client messages.

## 10. Milestones (from the Gate 2 proposal)

| Milestone | Date | Accepted when |
|---|---|---|
| Client decisions D1–D6 | Nov 3 | Recorded in the decision log |
| Foundation | Nov 10 | Stages 2/3/5/6 blocked without approval; 100% of changes logged |
| Prototype | Nov 17 | Matters A, B and C run end to end; every notice has a deadline; reminders fire; dashboard shows "where am I needed" in under 1 minute; export works |
| Real-practice test | Nov 24 | Replayed past matters fit; fixes done |
| Live-use approval | Nov 25 | Security checklist and D7–D12 approved in writing |
| Pilot (parallel run) | Nov 30 – Dec 18 | Nothing the current method catches is missed |

## 11. Tech stack and conventions

- **Next.js** (App Router) + **TypeScript**, **Supabase** (Postgres, Auth with MFA, row-level security), hosted on **Vercel** (U.S. region). Transactional email service for reminders.
- Database changes go through SQL migrations in `supabase/migrations/`.
- Business rules (gates, R1–R5) are enforced in the database or the server, not only in the UI.
- Deadline calculation is in one module with unit tests for every rule.
- Seed scripts create Matters A, B and C only.
- `.env.local` is never committed. Keep `.env.example` up to date.

## 12. Working style

- **Friday status** to the client: Done / Next / Blocked / Decisions needed.
- Keep `docs/decision-log.md` (decision, date, who decided) and `docs/assumptions-log.md`. Log the assumption and keep going; only ask the client when blocked for more than a day.
- At each gate: a proposed plan plus one consolidated decision list with recommendations.
- Explain things to Noli in simple, easy English, step by step, briefly.

## 13. Open client decisions

D1–D6: decided Nov 3 (decision log #6–#12). Frank prefers no more referrals: decide on the recommendation, log it, and list it in his final review.

**Due before live use (Nov 25). D7 and D9 need Frank himself (legal judgment and real client data):**

- D7: deadline rules verified.
- D8: retention period.
- D9: real data in the pilot.
- D10: staff account access.
- D11: client auto-updates.
- D12: who receives escalations.
