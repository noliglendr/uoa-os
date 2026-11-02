# UOA OS Phase 1: Summary, Open Questions, Delivery Plan

Source: *UOA OS - Phase 1* memo from Udoka Obie Amah (Principal) to Noli Del Rosario (Technical Lead), dated October 7, 2026.

## What the client wants

One internal "firm operating system" where every immigration matter lives from first inquiry to closed file. AI writes first drafts, attorneys approve everything, and the principal sees the whole firm on one screen so they only step in for judgment or signature. Immigration is the template that later practice areas will copy.

### The seven capabilities

| # | Capability | What it means in practice |
|---|---|---|
| 1 | Intake | Web form, email or referral creates a record, runs a conflict check, routes to the principal to accept or decline |
| 2 | Matter opening | On accept: engagement letter, fee terms, case file with the right checklist (I-130, I-485, I-765, I-131, bundles) |
| 3 | Document collection | Secure client portal, missing-document flags, automatic requests, full request/response log |
| 4 | Drafting | AI first drafts of forms, cover letters and RFE responses from the client file plus the firm's prior filings and templates. Never files |
| 5 | Attorney review gate | Nothing leaves the firm without in-system attorney approval, logged with name and time |
| 6 | Automation | Deadlines, client status updates, follow-ups and invoices fire on triggers |
| 7 | Oversight dashboard | Open matters, deadlines, stalled files, sign-off queue, revenue; "where am I needed" in under a minute |

### Non-negotiables
- Privilege by design: encryption in transit and at rest, role-based access, no client data used to train third-party models.
- Human sign-off before anything goes to a client, agency or third party.
- Full audit trail per matter.
- Firm owns and can export all data and templates; no single-vendor lock-in.
- Buy proven tools over custom build; build only where nothing credible exists.
- Fee logic configurable by an admin without a developer (actual pricing to be supplied later).

### Success measures (end of Phase 1)
Intake to opened matter under 24h with no re-keying; standard filing drafts never start from blank; zero missed deadlines; zero unapproved outbound items; principal's routine admin reduced to review/sign-off; every open matter current on the dashboard.

### How the work is sequenced
Each gate needs the principal's **written** approval before the next starts. No fixed durations.

- **Gate 0, resilience baseline** (first deliverable, counts toward evaluation): uptime monitoring and alerts on all live platforms, auto SSL renewal with expiry alerts, written runbook (hosting, domains, credentials, who to call), delivered as a short report.
- **Gate 1, process map**: interview the principal, walk real immigration matters, document today's end-to-end flow and where time is lost. No code.
- **Gate 2, architecture proposal**: recommended tools, buy vs build, security approach, cost, timeline, two alternatives plus a recommendation.
- **Gate 3, build and test** in this order: intake + matter opening, document collection, drafting layer, review gate + automation, dashboard. Each increment demoed on a real or realistic matter.

### Reporting and reserved decisions
- Weekly KPI dashboard update and a Friday written status (done / next / blocked).
- Blockers, security concerns and scope questions raised within 24 hours.
- Availability and response windows confirmed in writing before work begins.
- Principal decides: vendors and spend above an agreed ceiling, any client-data handling outside the approved architecture, scope changes.

### Out of scope
Other practice pillars, TAC and CiviQ work, client-facing marketing, any autonomous filing to USCIS or other agencies.

## Open questions and ambiguities

**Gate 0 (needed now)**
1. Which "live platforms" are in scope? (Firm website, client-facing apps, email/DNS, anything TAC or CiviQ related even though that work is otherwise out of scope?)
2. Who currently holds hosting, registrar, DNS and credential access, and is there a password manager to store the runbook's secrets in, rather than the report itself?
3. Preferred alerting channel and recipients (email, SMS, Slack) and acceptable monthly cost for monitoring tools.

**Before Gate 2**
4. What is the spend ceiling for vendor and tool costs without separate approval?
5. What does the firm already run today (practice management such as Clio/MyCase/Docketwise/INSZoom, email suite, document storage, billing, e-signature)? This decides most of buy vs build.
6. How many attorneys, paralegals and staff need access, and what roles? ("Attorney approval" implies more than one attorney may approve.)
7. Conflict check: against what data source, and does it cover adverse parties, which are rare in immigration but present in some matters?
8. AI drafting: which model provider is acceptable, and what contractual terms are required (zero data retention, no training, BAA-style DPA)? Is a self-hosted model expected or is a vendor with no-training terms enough?
9. "Our own prior filings": where do these live and in what format (scanned PDFs, Word, a case management system)? This drives the effort of the drafting layer.
10. Deadlines: which ones count (RFE response windows, biometrics, interview dates, receipt-notice follow-ups, statute-driven dates)? Will the system pull USCIS case status, or are dates entered by staff?
11. Revenue on the dashboard: from which billing/payment system, and is trust (IOLTA) accounting involved?
12. Data residency or bar-rule constraints (state bar guidance on cloud storage and AI use) the principal wants honored explicitly.

**Contract and process**
13. Does "written approval" of a gate mean email is enough, or a signed document?
14. Is the KPI dashboard in the reporting section the same as the product dashboard, or a separate project-tracking sheet for Phase 1 progress?
15. "Realistic matter" for demos: can we use synthetic data, and is real client data allowed in a test environment at all?

## Proposed delivery plan

**Step 1. Confirm terms (before any work)**
Send written confirmation of availability and response windows, and ask the Gate 0 questions above.

**Step 2. Gate 0, resilience baseline**
- Inventory every live domain and platform; record registrar, DNS, host, renewal dates, owners.
- Set up uptime and SSL expiry monitoring with a hosted tool (UptimeRobot, Better Stack or similar, free or low tier), alerts to the agreed channel.
- Confirm or enable auto-renewal for certificates (most hosts and Let's Encrypt/Cloudflare handle this) and for domains.
- Write the runbook: hosting, domains, credential locations (pointer to a password manager, not the secrets), escalation contacts, what to do when an alert fires.
- Deliver a short report and get written sign-off.

**Step 3. Gate 1, process map**
- 2 to 3 interview sessions with the principal plus a walk-through of real matters per form type (I-130, I-485, I-765, I-131, bundles).
- Output: swimlane map per matter type, document checklists, deadline sources, decision points, handoffs and time sinks, and a draft data model (client, matter, document, task, deadline, approval, invoice).

**Step 4. Gate 2, architecture proposal** with three options as requested:
- **A. Immigration practice-management platform + integrations** (e.g. Docketwise or INSZoom for forms and case file; LawPay/Clio-style billing; e-signature; AI drafting via an API with no-training terms; automation via the platform or Zapier/Make; dashboard via a BI tool). Least custom code, most aligned with "buy over build"; risk is export limits and vendor lock-in.
- **B. General legal PM (Clio or similar) as system of record + thin custom layer** for the AI drafting, review gate and dashboard. Balanced; more flexible across future practice areas.
- **C. Low-code core (e.g. Airtable/Retool or a Postgres + internal tool stack) with best-of-breed portal, e-sign and billing.** Most control and portability; most maintenance.
- Each option scored against the non-negotiables (encryption, RBAC, audit trail, export, AI data terms), cost and timeline. Likely recommendation is A or B, with the review gate and audit trail enforced as a single choke point that every outbound document must pass through.

**Step 5. Gate 3, build in the five increments the memo specifies**, each demoed on a synthetic or approved real matter, with the audit log and RBAC in place from increment 1 rather than bolted on.

**Step 6. Ongoing**
Friday status note template (done / next / blocked) and a simple Phase 1 KPI tracker from week one.

## Things to watch
- The memo explicitly makes Gate 0 part of the contractor's evaluation, so it is worth doing thoroughly and quickly.
- No gate has a fixed duration, but Gate 2 still has to include a timeline, so estimates will be needed after Gate 1.
- The AI drafting non-negotiable ("no client data used to train any third-party model") needs to be backed by the vendor's actual contract terms, not just a settings toggle; this belongs in the Gate 2 security section.
