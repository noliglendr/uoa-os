---
title: "Security Checklist"
subtitle: "For live-use approval (Nov 25, 2026) and before real data (D9, D17)"
---

# How to use it

Each line is either **verified** (checked in the live system, with how) or **to do** (with who does it). Live use and real client data wait until every line in sections 1–4 is verified. Frank signs the end of the page (CLAUDE.md, rule 8; milestone "Live-use approval").

# 1. Sign-in and access

| # | Check | Status |
|---|---|---|
| 1.1 | Every staff page needs a signed-in user **with two-step sign-in (MFA)**; without the second step, only the MFA page opens | Verified: the proxy sends aal1 sessions to /mfa; the database answers nothing without `aal2` (`current_app_role()`); tested Nov 11 (signed-out requests all go to sign-in) |
| 1.2 | Nobody can create their own account (sign-ups off in Supabase) | To do (Noli): confirm **Authentication → Providers → Allow new users to sign up** is off |
| 1.3 | Every active staff member has set up two-step sign-in | To do (Noli): Staff page shows "Two-step on" for everyone |
| 1.4 | The testing-only "Test Principal" account is switched off (assumption 22) | To do (Noli): Staff → switch off |
| 1.5 | Leaving staff lose access the same day | Verified: Staff → switch off (account kept, access removed; logged) |
| 1.6 | Each role sees and does only its own work (row-level security in Postgres) | Verified: database tests per role (roles, admin, outbox, documents tests in CI) |
| 1.7 | The attorney approves stages 2, 3, 5, 6, invoices, drafts, legal holds and the post-decision step | Verified: enforced in the database; end-to-end test in CI |

# 2. Data protection

| # | Check | Status |
|---|---|---|
| 2.1 | Encryption in transit | Verified: HTTPS only (Vercel and Supabase) |
| 2.2 | Encryption at rest | Verified: Supabase encrypts its database and storage at rest |
| 2.3 | Secrets only in environment variables, never in the code | Verified: `.env.local` is not committed; `.env.example` holds placeholders only |
| 2.4 | Uploaded files in a private bucket; only the server reads them; files renamed on upload | Verified: live test Nov 11 (client file name not kept; signed links last 60 seconds) |
| 2.5 | Upload links: only hashes stored, 6-digit code by another channel, 5 wrong codes lock, 14-day expiry | Verified: database tests and live test Nov 11 |
| 2.6 | No client names, numbers or facts in emails, logs or AI prompts (Step A) | Verified: matter codes only in emails; unit tests on what reaches the AI |
| 2.7 | Daily backups, and one restore tested | To do (Noli): upgrade Supabase to **Pro** (about $25/month), then restore a backup into a scratch project once (assumption 25) |
| 2.8 | Test data marked, so the firm's numbers count real work only | Verified: every matter so far is marked "Test data" (decision #36) |

# 3. Vendors

| # | Check | Status |
|---|---|---|
| 3.1 | Supabase: U.S. region; data processing terms accepted | To do (Noli): save a copy of the DPA |
| 3.2 | Vercel: U.S. region (iad1) | Verified: `vercel.json` |
| 3.3 | Resend: firm domain verified (emails reach staff, not only Noli) | To do (Noli, with the person who manages uoalegal.com DNS): docs/email-domain-setup.md |
| 3.4 | Anthropic: account owned by the firm; no training on firm data; zero data retention answer in writing; monthly spend limit | To do (Noli): before AI drafts on real matters (D21, D24) |

# 4. Records and recovery

| # | Check | Status |
|---|---|---|
| 4.1 | Every change logged with who and when; the log can't be changed or deleted | Verified: append-only event log, tested in CI |
| 4.2 | Nothing is deleted; closed files are frozen; legal hold by the attorney | Verified: database tests (decision #36) |
| 4.3 | The firm can export everything as CSV at any time | Verified: live test Nov 11 |
| 4.4 | Retention: closed files kept 7 years, never deleted automatically, flagged for attorney review | Verified: "Retention review" on My work (decision #36) |
| 4.5 | Monitoring and runbook (Gate 0) still current | To do (Noli): re-read the runbook against the new features |

# 5. Sign-off

| | |
|---|---|
| Checked by (Technical Lead) | |
| Date | |
| Approved for live use (Frank) | |
| Date | |

Real client data (D9) and real client documents (D17) need Frank's own approval in addition to this page.
