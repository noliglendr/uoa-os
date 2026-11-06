# Email domain setup: send UOA OS reminders from uoalegal.com

**For:** whoever manages the DNS for uoalegal.com · **Time:** about 15 minutes, plus up to a few hours for DNS to update

## Why

UOA OS sends deadline reminders through Resend (resend.com). Until uoalegal.com is verified there, reminders can only reach the developer's own inbox. After this, they come from `reminders@uoalegal.com` and reach the attorney and staff.

## What changes, and what does not

- **Adds** 3 records (plus 1 optional). They sit on `send.uoalegal.com`, `rsend.uoalegal.com` and `resend._domainkey.uoalegal.com`. The DNS for uoalegal.com is at **Hostinger** (hPanel → Domains → uoalegal.com → DNS / Nameservers); the firm's mail is Titan.
- **Does not touch** the firm's existing email: the main MX records (`titan.email`) and the main SPF record of `uoalegal.com` stay exactly as they are.
- No mailbox is needed for `reminders@`. It is a sender address only.

## Steps

**1. Resend (Noli does this)**
1. Sign in at resend.com → **Domains** → **Add Domain**.
2. Domain: `uoalegal.com`. Region: **North Virginia (us-east-1)**.
3. Resend shows the exact records. Send them to the DNS manager (copy the table, or a screenshot).

**2. DNS (the DNS manager does this)**

At the DNS provider for uoalegal.com, add the records **exactly as Resend shows them**. They look like this (the values come from Resend):

| Type | Name / Host | Value | Note |
|---|---|---|---|
| TXT | `resend._domainkey` | a long `p=...` key from Resend | DKIM signature |
| CNAME | `rsend` | `rsend.…mta.net` from Resend | Sending (SPF) |
| CNAME | `send` | `send.…mta.net` from Resend | Sending (SPF) |
| TXT (optional) | `_dmarc` | `v=DMARC1; p=none;` | **Only if no `_dmarc` record exists yet.** Never add a second one. |

Tips:
- Resend shortens long values with `[…]`: copy each one with Resend's copy button, never by hand.
- Some providers add the domain by themselves: enter `send`, not `send.uoalegal.com`.
- If the firm's DNS is managed by the web host or registrar, the menu is usually called **DNS**, **DNS Zone** or **Advanced DNS**.

**3. Verify (Noli)**
1. In Resend → **Domains** → `uoalegal.com` → **Verify DNS Records**. Wait until all show **Verified** (minutes to a few hours).

**4. Switch UOA OS over (Noli)**
1. Vercel → uoa-os → **Environment Variables** → change `EMAIL_FROM` to `UOA OS <reminders@uoalegal.com>` → Save.
2. **Deployments** → ⋯ → **Redeploy**.
3. In UOA OS → **Settings**, set `escalation.recipients` back to `["attorney_of_record", "principal", "docketing"]` (D12).
4. Vercel → **Settings** → **Cron Jobs** → **Run**. Check that Frank and Noli both receive the reminder. Reminders already sent are not sent again; the next one goes out at the next threshold.
5. Mark assumption 20 as closed in `docs/assumptions-log.md`.

## If something goes wrong

- **Records stay "Pending"** after a few hours: check the host name (no doubled `uoalegal.com.uoalegal.com`) and that the DKIM value was pasted in full.
- **Emails land in spam:** add the DMARC record above (only if none exists), then wait a day.
- **To undo:** remove the 3 records (and `_dmarc` if it was added). The firm's normal email is not affected either way.
