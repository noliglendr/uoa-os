import type { Metadata } from "next";
import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isToken, sha256 } from "@/lib/documents";
import { formatDate, formatDateTime } from "@/lib/labels";
import { verifyCode } from "./actions";
import { loadSession } from "./session";
import { UploadItem } from "./upload-item";
import { Logo } from "@/components/logo";

// The client's secure upload page (Increment 2; decision #31). Shows nothing
// about the matter until the 6-digit code is entered.
export const metadata: Metadata = {
  title: { absolute: "Upload documents · UOA Legal" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const STATE_TEXT: Record<string, string> = {
  expired: "This upload link has expired. Please contact our office for a new one.",
  cancelled: "This upload link is no longer in use. Please contact our office.",
  locked: "This link was locked after too many wrong codes. Please contact our office for a new one.",
  closed: "This matter is closed. Please contact our office if you need to send documents.",
  not_found: "This upload link is not valid. Please check the link, or contact our office.",
  error: "Something went wrong. Please try again in a moment.",
};

export default function UploadPage({ params, searchParams }: PageProps<"/upload/[token]">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Logo size={40} />
        <div className="leading-tight">
          <p className="font-semibold text-slate-900">UOA Legal</p>
          <p className="text-sm text-slate-500">Secure document upload</p>
        </div>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
      <p className="mt-8 text-xs text-slate-500">
        Your files go straight to UOA Legal over an encrypted connection and are seen only by the firm. Please do not share this link.
      </p>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/upload/[token]">, "params" | "searchParams">) {
  const { token } = await params;
  const e = (await searchParams).e;
  if (!isToken(token)) return <Notice text={STATE_TEXT.not_found} />;

  const { data: state } = await createAdminClient().rpc("doc_link_state", { p_token_hash: sha256(token) });
  if (state !== "open") return <Notice text={STATE_TEXT[String(state ?? "error")] ?? STATE_TEXT.error} />;

  const s = await loadSession(token);
  if (!s) {
    const wrong = e === "wrong";
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Enter your 6-digit code</h1>
        <p className="mt-1 text-sm text-slate-600">Our office gave you this code separately, by phone or text message.</p>
        {(wrong || (e && e !== "wrong")) && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {wrong ? "That code is not right. Please try again. After 5 wrong codes the link is locked." : (STATE_TEXT[String(e)] ?? STATE_TEXT.error)}
          </p>
        )}
        <form action={verifyCode} className="mt-4 flex gap-2">
          <input type="hidden" name="token" value={token} />
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            aria-label="6-digit code"
            className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.3em] text-slate-900 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
          <button type="submit" className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900">
            Continue
          </button>
        </form>
      </section>
    );
  }

  const r = s.request;
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Documents we need</h1>
        <p className="mt-1 text-sm text-slate-600">
          Please upload each document by <strong>{formatDate(r.due_date)}</strong>. PDF, JPG, PNG or HEIC files, up to 25 MB each. You can upload more than one
          file for an item. This link works until {formatDateTime(r.expires_at)}.
        </p>
      </div>
      <ul className="space-y-3">
        {r.items.map((i) => (
          <li key={i.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-medium text-slate-900">{i.label}</p>
            {i.uploads.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {i.uploads.map((u, n) => (
                  <li key={n} className={u.status === "rejected" ? "text-red-700" : "text-emerald-700"}>
                    {u.status === "rejected" ? `✗ File ${n + 1} could not be used: ${u.reject_reason}. Please upload it again.` : `✓ File ${n + 1} received ${formatDateTime(u.created_at)}`}
                  </li>
                ))}
              </ul>
            )}
            <UploadItem token={token} itemId={i.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Notice({ text }: { text: string }) {
  return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">{text}</p>;
}
