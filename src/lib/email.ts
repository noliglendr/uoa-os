import "server-only";

// failed = the email did not go out and should be retried. A dry run is not a failure.
export type EmailResult = { delivered: boolean; failed: boolean; detail: string };

// Transactional email for deadline reminders (R2).
// With no EMAIL_API_KEY the email is not sent ("dry run"); the reminder is
// still recorded and shown in the app, so the prototype works without a vendor.
// The provider is Resend (https://resend.com); swap the fetch to change it.
export async function sendEmail(to: string[], subject: string, body: string): Promise<EmailResult> {
  const key = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { delivered: false, failed: false, detail: "dry run: EMAIL_API_KEY or EMAIL_FROM not set" };
  if (to.length === 0) return { delivered: false, failed: true, detail: "no recipients" };

  // Resend accepts about 2 requests a second: the daily job sends emails one
  // after another, so they are paced, and a "too many requests" answer is
  // retried after a pause instead of waiting for tomorrow's run.
  for (let attempt = 1; ; attempt++) {
    await pace();
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text: body }),
        // A hanging email service must not hang the whole daily job.
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429 && attempt < 4) {
        const wait = Number(res.headers.get("retry-after")) || attempt;
        await sleep(Math.min(wait, 10) * 1000);
        continue;
      }
      if (!res.ok) {
        const reason = await res.json().then((j) => String(j?.message ?? ""), () => "");
        return { delivered: false, failed: true, detail: `email service error ${res.status}${reason ? `: ${reason.slice(0, 200)}` : ""}` };
      }
      return { delivered: true, failed: false, detail: "sent" };
    } catch (e) {
      return { delivered: false, failed: true, detail: `email service unreachable: ${String(e).slice(0, 200)}` };
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// At most one email every 600 ms from this server process.
let nextSlot = 0;
async function pace() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 600;
  if (wait) await sleep(wait);
}
