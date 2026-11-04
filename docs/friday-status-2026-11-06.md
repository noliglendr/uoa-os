# Friday status: November 6, 2026

To send by email to Frank. Attach or link `increment1-review.md`.
Send the temporary password **by phone**, never in this email.

---

**Subject:** UOA OS: Increment 1 ready for your review

Frank,

As you asked, I finished Increment 1 without more referrals. It is ready for your review.

**Link:** https://uoa-os.vercel.app
**Sign in:** your firm email address and the temporary password I gave you by phone. The first time, scan the QR code with an authenticator app (Google Authenticator or Microsoft Authenticator). Then change the password on the **Account** page.

**The 10-minute tour** is in the attached review guide. The short version: open the **Dashboard**, then **Matter B**, and click **Approve strategy memo**. That is your approval gate at work. All matters are made up; no client data is in the system.

**Done this week**
- Matter Tracker with Deadline Control, built to your 11-stage framework with all 14 redline changes
- Your approval is required at stages 2, 3, 5 and 6, enforced by the database
- Every notice gets a deadline or your recorded "no deadline"; reminders at 21/14/7/3/1 days (tested and delivered)
- Weekly status sweep, staff and roles, full history, CSV export
- Online, with 2-step sign-in; all automatic tests pass

**Next**
- Your edits from this review (Nov 9–10)
- Prototype run of Matters A, B and C end to end (Nov 17)
- Real-practice test on 3 past matters, names removed (Nov 24)
- Plan for Increment 2, client document collection (attached separately; no action needed now)

**Blocked:** nothing.

**Only you can decide (before live use, Nov 25)**
1. **D7: deadline rules.** Open **Deadline rules** and click **Verify** on each rule that is right; add a note on any that is wrong.
2. **D9: real client data in the pilot.** Yes or no, after the security checklist passes.

Everything else I decided on my recommendations, as you asked. The list is in section 3 of the review guide, so you can change any of it.

**One thing to know:** for now, reminder emails go only to me. They will reach you and staff once the firm's email domain is set up for sending (a 15-minute DNS change; I am arranging it with whoever manages uoalegal.com).

Noli

---

## Internal checklist before sending

- [ ] Frank's account works: temporary password given by phone
- [ ] Matter B still waits for the strategy approval (leave it for Frank's tour)
- [ ] `escalation.recipients` is still `["attorney_of_record"]` until the domain is verified (assumption 20)
- [ ] Attach `increment1-review.md` (and `increment2-plan.md` if ready)
