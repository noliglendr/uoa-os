---
title: "Increment 3 Plan"
subtitle: "AI first drafts, attorney approval"
---

# 1. Summary

**What it is:** the drafting item in your memo. Staff press a button on a matter and get a first draft of a routine letter. You approve every draft before anyone can use it.

**My recommendation:** build it in two steps, and start with the safer one.

- **Step A (this plan):** cover letters, evidence request letters and closing letters. These need no client documents, and **no client personal data goes to the AI**.
- **Step B (later, with its own plan):** RFE and NOID response outlines and statement drafts. These need the client's documents, so they wait for Increment 2 and your separate approval.

**Dates:**

- **Build and test on made-up matters:** **Jan 4 – Jan 27**, after the Increment 1 pilot
- **Your review:** **Jan 29**
- **Live use:** only after you approve D21

**Added tool cost:** a monthly spending limit of **$25** on AI use, so total tools stay within the $150 budget (D5).

**What I need from you:** only D21 needs you personally, plus approving each letter template once. I will proceed on the other recommendations in section 6 unless you tell me otherwise.

# 2. What it does

1. **Draft button.** On a matter, staff pick a letter type. The system writes a first draft from the template you approved and the matter's workflow data.
2. **Your approval.** Each draft is marked **DRAFT** and appears in your "My work" list. You approve it, send it back with a note, or reject it. The database refuses to mark a draft final without your approval.
3. **Client details added by staff.** The draft holds blanks such as `[CLIENT NAME]` and `[ADDRESS]`. Staff fill them in outside the AI.
4. **Full log.** The matter's history shows who asked for each draft, which template and AI model were used, what was changed, and who approved it and when.
5. **Firm's own record.** Drafts and their history are included in the CSV export.

**It never** files, signs, or sends anything to a client or an agency. Staff send a letter only after you approve it.

**Not in Step A:** reading client documents, RFE or NOID responses, statements, legal argument, and filling in USCIS forms.

# 3. First letters

| Letter | Comes from | Needs client documents? |
|---|---|---|
| Filing cover letter | Form type, forum, fee, enclosure list | No |
| Evidence request letter | The matter's evidence checklist | No |
| Closing letter | Outcome and client duties (such as AR-11 and I-751) | No |

# 4. How client data stays safe

| Need | How |
|---|---|
| No personal data sent to the AI | Only a fixed list of fields is sent: matter type, form, forum, stage, checklist item types and template text. Names, receipt numbers and notes typed by staff are never sent. Automatic tests check this. |
| No training on firm data | The vendor's **signed contract** must say so. A settings switch is not enough. |
| Data the vendor keeps | Zero data retention requested from the vendor, with the answer in writing |
| Who can request a draft | Attorney, principal and paralegal |
| Who can approve a draft | Attorney and principal only |
| Spending | Monthly limit set with the vendor |
| Testing | Made-up Matters A, B and C only |

# 5. Dates

These dates assume the Increment 1 pilot ends on Dec 18 with nothing missed.

| Step | Date | It's done when |
|---|---|---|
| Sample letters collected | Dec 18 | One of each letter, with every personal detail removed |
| Vendor terms checked | Dec 18 | No-training terms saved; retention answer in writing |
| Build | Jan 4 – Jan 20 | The three letters draft, wait for approval and are logged on Matters A, B and C |
| Test | Jan 21 – Jan 27 | No personal data is sent; no draft becomes final without approval |
| Your review | **Jan 29** | You approve, or list edits |
| Live use | After D21 | Templates approved; vendor terms and bar-rule check complete |

# 6. Decisions

**Decided on my recommendation (tell me only if you want a change):**

| # | Decision | Recommendation |
|---|---|---|
| D18 | AI vendor | **Anthropic (Claude) API**, on the condition that the contract says no training on firm data. Azure OpenAI is the fallback. |
| D19 | First letters | **Cover, evidence request and closing letters**, in that order |
| D20 | Past filings as examples | **Not in Step A.** Your approved templates are enough. Revisit in Step B. |

**Needs you personally (before live use):**

| # | Decision | Recommendation |
|---|---|---|
| D21 | AI drafts on live matters | **Yes, after you confirm what the Texas and New York bar rules require**, including whether clients must be told or must consent. Step A only: sending real client data to the AI is a separate decision in the Step B plan. |

**What I need for Step A:** one sample of each letter, with every personal detail removed, and your approval of each template once.
