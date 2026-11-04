---
title: "Increment 2 Plan"
subtitle: "Client document collection"
---

# 1. Summary

**What it is:** the second item in your memo: clients send their documents to the firm through a secure page, every request and every upload is logged, and missing documents are flagged.

**My recommendation:** build it **inside UOA OS**, on the evidence checklist we already have (stage 4), with secure upload links instead of a full client login.

- **Build and test on made-up files:** **Dec 1 – Dec 18**, alongside the Increment 1 pilot
- **Your review:** **Dec 18**
- **Real client documents:** only after you approve the security checklist for documents (D17)
- **Added tool cost:** about **$25 per month** (database plan with file storage and daily backups), within the $150 budget (D5)

**What I need from you:** nothing now. Under your Nov 3 instruction, I will build on the recommendations in section 5 unless you tell me otherwise. Only D17 needs you personally, before real documents are used.

# 2. What it does

1. **Request list per client.** From the evidence checklist, staff pick the items a client (or a third party, such as an employer or expert) must send. Each item has an owner and a due date.
2. **Secure upload link.** The client gets one link, by email from staff. They confirm a 6-digit code sent to their email, then upload. The link expires after 14 days and can be cancelled at any time.
3. **Missing-document flags.** Each item shows *requested*, *received*, *accepted* or *rejected (reason)*. Items overdue for 7 days appear on the dashboard.
4. **Staff review.** A paralegal accepts or rejects each upload. Third-party drafts still need your review (redline 12).
5. **Full log.** Every request, upload, download, acceptance and rejection is in the matter's history, with who and when.
6. **The firm owns the files.** Any matter's documents can be downloaded as one ZIP file.

**Not in Increment 2:** e-signature, payments, AI reading of documents, client messages sent automatically, and a full client account with a password.

# 3. How documents are kept safe

| Need | How |
|---|---|
| Personal data kept apart (rule R5) | Files sit in a **separate storage area** with its own access rules. The workflow tables keep only the item, its status and a file reference. |
| Encryption | In transit (HTTPS) and at rest (storage encryption) |
| Who can open files | Attorney, principal and paralegal. Docketing and intake see the status, not the file. |
| Unsafe files | PDF, JPG, PNG and HEIC only, up to 25 MB each; other types are refused |
| Clients see only their own items | Each link is tied to one client on one matter |
| Retention | Follows D8 (7 years after closure; never auto-deleted) |
| Testing | Made-up files only until D17 |

# 4. Dates

| Step | Date | It's done when |
|---|---|---|
| Plan accepted | Nov 13 | Your Friday review, or no objection |
| Build | Dec 1 – Dec 14 | Requests, links, uploads, review and log work on Matters A, B, C |
| Test | Dec 15 – Dec 17 | A made-up client completes a full request list; every step is logged |
| Your review | **Dec 18** | You approve, or list edits |
| Real documents | After D17 | Security checklist for documents passed |

# 5. Decisions

**Decided on my recommendation (tell me only if you want a change):**

| # | Decision | Recommendation |
|---|---|---|
| D13 | Build document collection inside UOA OS, or buy a client portal | **Build inside**, on the existing checklist. A bought portal would hold a second copy of each matter and can't follow your approval points. |
| D14 | How clients sign in | **Secure link + 6-digit email code**, no password. Clients rarely log in more than a few times. |
| D15 | Who sends the request email | **Staff click "Send"** using a template you approve once. Nothing goes to a client automatically (D11 stays off). |
| D16 | Who can open uploaded files | Attorney, principal, paralegal |

**Needs you personally (before real documents):**

| # | Decision | Recommendation |
|---|---|---|
| D17 | Real client documents in the system | **Yes, after the document security checklist passes** (separate encrypted storage, access test, backup test, vendor terms) |
