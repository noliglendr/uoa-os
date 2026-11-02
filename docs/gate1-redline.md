---
title: "Matter Lifecycle Framework: Redline"
subtitle: "Gate 1. Walkthrough of Matters A, B and C against stages 1–11"
---

# 1. Summary

I walked three matters through the 11 stages: Sample A (EB-2 NIW petition), Sample B (EOIR motion to reopen), and a new Matter C (a spousal adjustment bundle with biometrics and an interview). The spine holds: every event in all three matters fits one of the 11 stages. The map breaks in **five places**, and each needs a change before build:

1. **Response loops.** RFE, NOID, I-290B and motion responses repeat the evidence → sign-off → filing cycle inside one matter. The map is a straight line, so it has nowhere to put the second cycle.
2. **One matter, many filings.** Matter C produces four receipts, each with its own clock and decision. Matter B can carry a stay request in a second forum. Stages 6–10 need to run once per filing, not once per matter.
3. **Clocks that start before engagement.** Matter B's deadline is live at intake, but the deadline calendar is only built and verified at stage 3, after the retainer.
4. **More than one client per matter.** Matter C has a petitioner and a beneficiary. Conflicts, engagement and G-28s apply per client.
5. **The same-matter versus new-matter rule conflicts with R4.** Stage 10 keeps motions and appeals inside the matter, while Q3 and stage 11 open follow-on work as a new matter. A reopened case also carries its open EOIR appearance forward, so R4 would block closure.

There is also one correction to check: **the BIA appearance form is EOIR-27, not EOIR-28** (section 4, item 6).

The four open decisions are now settings with defaults (section 5). Every assumption I made is in the assumptions log (section 6). None of them blocks build.

# 2. Matter C (synthetic, application track)

**Matter C: spousal adjustment bundle.** A U.S. citizen petitioner and a beneficiary spouse who is in the U.S. after a lawful entry. The petition and application are filed together: I-130 + I-485 + I-765 + I-131, with I-864 (petitioner as sponsor) and I-693 (civil surgeon medical exam). It includes a biometrics appointment and an interview. Role labels only. No facts are drawn from a real client.

| Stage | Matter C walkthrough |
|---|---|
| 1 Intake | Inquiry from the petitioner. Conflicts are run on **both** spouses. Matter typed as application. Urgency: none, unless status is expiring or travel is planned. |
| 2 Engagement | Joint representation of the petitioner and the beneficiary, with a written consent to joint representation. Flat fee plus government fees. Responsibility split: clients supply civil documents and the medical exam; the firm drafts all forms. |
| 3 Strategy | Eligibility check: lawful entry, bars, immediate-relative category, sponsor income versus the poverty guideline (joint sponsor needed?). Travel advisory: no travel until advance parole is approved. |
| 4 Evidence | Civil documents for both clients, bona fide marriage evidence, I-864 with tax returns, sealed I-693 from a civil surgeon (a third party), and photos. |
| 5 Sign-off | Attorney final review. **Both** clients sign their own forms. Packet locked. |
| 6 Filing | One packet with four forms. A G-28 for each client, with each form. One mailing. Fees per form (I-765/I-131 with no added fee when filed with I-485). |
| 7 Receipt | **Four receipt notices**, each with its own receipt number and processing window. Sweep tracks all four. |
| 8 Agency action | Biometrics appointment (the client attends; reschedule if needed). Later, an interview notice (both spouses attend, and the attorney attends). Interview prep session two weeks before. A possible RFE at or after the interview. |
| 9 Decision | **Staggered.** The EAD and advance parole are approved months before the I-485. The I-130 and I-485 are decided at or after the interview. |
| 10 Post-decision | Green card delivered. If the marriage was under two years old at approval, residence is conditional, and I-751 becomes due in the 90 days before the second anniversary. |
| 11 Closure | Close when the card is received and acknowledged. The closing letter lists the I-751 window, the card expiry and the AR-11 duty. |

# 3. Walkthrough findings by matter

## Matter A: EB-2 NIW petition (Sample A)

| Stage | Fits? | Where the map breaks or needs detail |
|---|---|---|
| 1 Intake | Partly | The preliminary assessment letter is work done **before** the retainer. The map has no prospect state and no tracking of the "no attorney-client relationship" disclaimer. There is also no exit path for declined prospects (non-engagement letter). |
| 2 Engagement | Yes | Two-phase fee fits "fee phases". |
| 3 Strategy | Yes | No external deadline exists yet. The calendar can be empty, so the attorney needs a "no deadline yet" flag, as R1 has for notices. |
| 4 Evidence | Partly | Expert letters go out to third parties for signature **before** the final review. The attorney reviews the draft letter before it is sent to the expert, so this needs a gate inside stage 4, not only at stage 5. |
| 5 Sign-off | Yes | |
| 6 Filing | Partly | Premium processing can be requested later with I-907, after the I-140 is filed. That is a second filing on the same receipt number. |
| 7 Receipt | Yes | |
| 8 Agency action | **Breaks** | An RFE response needs evidence, review and filing again. The map has no loop back from 8 to 4–6. |
| 9 Decision | Yes | |
| 10 Post-decision | **Breaks** | Is the I-290B part of this matter (stage 10) or a new matter (Q3 and stage 11: "follow-on filings open as new matters")? The framework says both. The I-290B is also a new form, so it needs a new G-28. |
| 11 Closure | Yes | Approval: hand off to a new matter for adjustment or consular processing. |

## Matter B: EOIR motion to reopen (Sample B)

| Stage | Fits? | Where the map breaks or needs detail |
|---|---|---|
| 1 Intake | **Breaks** | The deadline is computed at same-day triage, but the calendar is only built and attorney-verified at stage 3. The clock can run out while the retainer is pending. |
| 2 Engagement | Yes | Limited-scope retainer fits. |
| 3 Strategy | Partly | A stay request may go to the immigration court, the BIA or ICE. A stay request to ICE is a **second forum** in the same matter, with its own appearance (G-28) and decision. |
| 4–5 | Yes | |
| 6 Filing | Partly | Filing and the ECAS service on DHS fit. The map assumes one filing per stage; here the motion and a stay request can be filed together or close together. |
| 7 Receipt | Partly | EOIR doesn't issue USCIS-style receipt numbers. The weekly sweep (Q1 backstop) checks receipt numbers only, so it needs an EOIR equivalent (ECAS and EOIR case status). |
| 8 Agency action | Yes | DHS opposition, hearing notice and orders fit. A bond or custody hearing is a separate proceeding and may need its own matter. |
| 9 Decision | Yes | |
| 10 Post-decision | **Breaks** | A BIA appeal needs a new appearance on Form **EOIR-27** (section 4, item 6). If granted, the case "resets to a merits track", which overlaps with stage 11's new merits matter. |
| 11 Closure | **Breaks** | R4 blocks closure while an appearance is open. On a grant, the court appearance continues into the new merits matter, so the motion matter can never close unless the appearance can move to the new matter. |

## Matter C: spousal adjustment bundle (synthetic)

| Stage | Fits? | Where the map breaks or needs detail |
|---|---|---|
| 1 Intake | Partly | Two prospective clients. Conflicts are run on both. |
| 2 Engagement | **Breaks** | The framework assumes one client per matter. Joint representation needs a consent recorded at engagement. |
| 3–5 | Yes | Both clients sign at stage 5. |
| 6 Filing | Partly | A G-28 per client per form (several G-28s in one packet). |
| 7 Receipt | **Breaks** | Four receipts, four windows. The model has one receipt per matter. |
| 8 Agency action | Partly | Biometrics and interviews are **appointments**, not response deadlines. They need attendance tracking and prep tasks. Routing a biometrics notice to the attorney the same day is unnecessary, because the client and the paralegal act on it. |
| 9 Decision | **Breaks** | Decisions arrive per form, months apart. "Outcome logged" must be per filing. |
| 10–11 | Yes | The closing letter works as written and lists the I-751 window. |

# 4. Redline: proposed changes to the framework

| # | Section | Current text | Proposed change | Why (matter) |
|---|---|---|---|---|
| 1 | §2 spine | Stages run once per matter | Add a **response cycle**: stages 4 → 5 → 6 can repeat inside a matter for RFE, NOID, I-290B and motion responses. Each cycle has its own attorney gates (R3 applies to every cycle). | A, B |
| 2 | §2 stages 6–10, §5 | One filing and one receipt per matter | A matter holds **one or more Filings**. Stages 6–10 are tracked per filing (own receipt, deadlines, decision). The matter advances to stage 11 only when every filing is decided. | C, A (I-907), B (stay) |
| 3 | §2 stage 1 | Deadline computed at intake; calendar verified at stage 3 | For EOIR, federal or any hard-deadline intake: the attorney verifies the deadline **at stage 1**, before engagement. If engagement isn't signed by an alert date, escalate. | B |
| 4 | §2 stages 1–2, §5 | One client per matter ("Party, role only") | A matter can have **several clients** (e.g. petitioner + beneficiary). Conflicts per party. Joint representation consent recorded at stage 2. Appearances per client. | C |
| 5 | §3 Q3, stage 10–11 | Stage 10 includes motion/appeal/refile; Q3 and stage 11 open follow-on filings as new matters | Pick one rule. **Proposed:** a motion or appeal on the **same** decision stays in the matter (stage 10) if the retainer covers it; a refile or the next phase (adjustment, merits case) opens a **new** matter. | A, B |
| 6 | §3 Q2 | "EOIR-28 covers the immigration court and the BIA" | **EOIR-28 is for the immigration court. EOIR-27 is for the BIA.** A circuit court petition for review needs the court's own appearance. Please verify. | B |
| 7 | §5 R4 | Cannot close with an open appearance | Allow an appearance to be **transferred** to a successor matter (logged event). R4 then checks for appearances that are open and not transferred. | B |
| 8 | §3 Q1, stage 8 | Every notice routed to the attorney the same day | Route by notice type: RFE, NOID, decisions, hearings and interviews to the attorney the same day; **biometrics and receipts to docketing/paralegal and the client**, with the attorney informed. | C |
| 9 | §3 Q1 backstop | Weekly sweep on receipt numbers | The sweep covers **USCIS receipts and EOIR matters** (ECAS / EOIR case status). | B |
| 10 | §4 deadline table, §5 | Response windows only | Add **appointments** as a deadline type (biometrics, interview, hearing): date, who must attend, prep task (e.g. 14 days before), reschedule request. | C |
| 11 | §2 stage 1 | No prospect or declined path | Add a **prospect** state (pre-retainer work such as the assessment letter, with the no-relationship disclaimer) and a **declined** exit (non-engagement letter, logged). | A |
| 12 | §2 stage 4 | Attorney review at stage 5 | Add an attorney review **inside stage 4** for third-party drafts (expert and employer letters) before they go out for signature. | A |
| 13 | §2 stage 9 | "Client told by the attorney, not by the system" | Keep for decisions. Allow **routine, template-approved updates** (receipt arrived, biometrics scheduled) to go out automatically. This matches capability 6 of the Phase 1 memo. | C |
| 14 | §2 stage 3 | Strategy memo only | Add **client duties during the matter** to the memo: travel advisory (no travel without advance parole) and address-change duty (AR-11 within 10 days). | C |
| 15 | §4 deadline table | (missing rows) | Add: biometrics and interview (date on the notice); I-751 (90 days before the second anniversary of residence, a client duty listed in the closing letter); IJ motion to reconsider (30 days from the order); DHS response to a motion in immigration court (verify). | B, C |

# 5. Open decisions as settings (defaults so build never waits)

| Setting | Default | Options | Notes |
|---|---|---|---|
| `attorney_of_record.default` | Udoka Obie Amah on every matter | Any attorney user | Override per matter at stage 1. Only the attorney of record approves gates on that matter until a "co-approver" setting is turned on. |
| `delegated_account_access` | **Off**: staff prepare, the attorney submits | Off / Prepare only / Submit after attorney gate | Logins are never shared. Delegation only through each platform's own access features. The packet lock gate (stage 5) always applies. |
| `premium_processing` | **Ask per matter** at stage 3; default "No" | Ask / Always / Never | Only shown for eligible form types. If added later, it creates an I-907 filing under redline item 2. |
| `retention.years_after_close` | **7 years**, with no automatic deletion | Number of years per state | At the destroy-after date the system flags the file for attorney review. A legal hold blocks it. Udoka to confirm against the NY and TX rules. |
| `next_phase_new_matter` | Yes | Yes / No | From Q3 [Confirm]. Works with redline item 5. |
| `deadline.mailing_extension_days` | 3 | Per rule | Every computed deadline still needs the attorney-verified flag. |
| `deadline.escalation_days` | 21, 14, 7, 3, 1 | List | From R2. |

# 6. Assumptions log

| # | Date | Assumption | Default used | Impact if wrong | Status |
|---|---|---|---|---|---|
| 1 | Oct 21 | Samples A and B, plus a synthetic Matter C, are the three walkthrough matters | As instructed | None | Confirmed by Udoka |
| 2 | Oct 21 | Udoka is attorney of record on all matters | Setting default | Change the setting | Open, not blocking |
| 3 | Oct 21 | No delegated account access until decided | Off | Turn the setting on | Open, not blocking |
| 4 | Oct 21 | Premium processing decided per matter, default no | Ask per matter | Change the setting | Open, not blocking |
| 5 | Oct 21 | Retention of 7 years, never auto-deleted | 7 years + review | Change the number | Open, not blocking |
| 6 | Oct 21 | A motion or appeal on the same decision stays in the matter if the retainer covers it | Redline item 5 | Move to the new-matter path | Pending redline acceptance |
| 7 | Oct 21 | Routine status updates can go to clients from approved templates | Redline item 13 | Turn auto-updates off | Pending redline acceptance |
| 8 | Oct 21 | Deadline windows in the framework are correct as written; new rows are marked "verify" | Attorney-verified flag | Attorney corrects before use | Ongoing |

# 7. Next step

Please accept this redline or mark it up. Once it's accepted, I'll fold it into the framework and start build. Items 1, 2, 4 and 7 change the data model, so I'll build them as proposed unless you mark them otherwise. Everything else is a setting and can change later without rework.
