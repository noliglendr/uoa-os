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

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: body }),
    });
    if (!res.ok) {
      const reason = await res.json().then((j) => String(j?.message ?? ""), () => "");
      return { delivered: false, failed: true, detail: `email service error ${res.status}${reason ? `: ${reason.slice(0, 200)}` : ""}` };
    }
  } catch (e) {
    return { delivered: false, failed: true, detail: `email service unreachable: ${String(e).slice(0, 200)}` };
  }
  return { delivered: true, failed: false, detail: "sent" };
}
