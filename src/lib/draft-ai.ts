import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";

export type DraftResult = { text: string; model: string };

// One short letter from Claude. With no ANTHROPIC_API_KEY the template comes back
// unchanged ("dry run"), so the review flow works without a vendor, like email.ts.
export async function generateDraft(system: string, user: string, templateBody: string): Promise<DraftResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { text: templateBody, model: "none (dry run: template only)" };

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  let message;
  try {
    message = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new Error("The AI key was refused. Check ANTHROPIC_API_KEY in Vercel.");
    if (error instanceof Anthropic.RateLimitError) throw new Error("The AI service is busy or the monthly limit was reached. Try again later.");
    if (error instanceof Anthropic.APIError) throw new Error(`The AI service could not make the draft (error ${error.status ?? "no response"}). Try again.`);
    throw error;
  }

  if (message.stop_reason === "refusal") throw new Error("The AI declined to write this draft. Write it by hand.");
  if (message.stop_reason === "max_tokens") throw new Error("The AI draft was cut off. Try again.");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  if (!text) throw new Error("The AI returned an empty draft. Try again.");
  return { text, model: message.model };
}
