import "server-only";

export type EmailResult = { delivered: boolean; detail: string };

// Transactional email for deadline reminders (R2).
// With no EMAIL_API_KEY the email is not sent ("dry run"); the reminder is
// still recorded and shown in the app, so the prototype works without a vendor.
// The provider is Resend (https://resend.com); swap the fetch to change it.
export async function sendEmail(to: string[], subject: string, body: string): Promise<EmailResult> {
  const key = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { delivered: false, detail: "dry run: EMAIL_API_KEY or EMAIL_FROM not set" };
  if (to.length === 0) return { delivered: false, detail: "no recipients" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text: body }),
  });
  if (!res.ok) return { delivered: false, detail: `email service error ${res.status}` };
  return { delivered: true, detail: "sent" };
}
