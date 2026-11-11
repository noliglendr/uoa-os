"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { finishUpload, startUpload } from "./actions";

const MAX_BYTES = 25 * 1024 * 1024;
const TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heic" };

/** One item's upload button. The file goes straight to the firm's private storage. */
export function UploadItem({ token, itemId }: { token: string; itemId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({ busy: false, message: null, error: false });

  async function upload(file: File) {
    const type = Object.values(TYPES).includes(file.type) ? file.type : TYPES[file.name.toLowerCase().split(".").pop() ?? ""];
    if (!type) return setState({ busy: false, message: "Only PDF, JPG, PNG or HEIC files can be uploaded.", error: true });
    if (file.size > MAX_BYTES) return setState({ busy: false, message: "The file is larger than 25 MB.", error: true });
    setState({ busy: true, message: `Uploading ${file.name}…`, error: false });
    try {
      const start = await startUpload(token, itemId, type, file.size);
      if ("error" in start) return setState({ busy: false, message: start.error, error: true });
      // A time limit that fits a slow phone connection (25 KB/s, plus 2 minutes),
      // so a stalled connection ends with a message instead of spinning forever.
      const limitMs = 120_000 + Math.ceil(file.size / 25_000) * 1000;
      const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(limitMs) }) },
      }).storage;
      const { error } = await storage.from("client-documents").uploadToSignedUrl(start.path, start.uploadToken, file, { contentType: type });
      if (error) {
        const slow = /abort|timeout/i.test(`${error.name} ${error.message}`);
        return setState({ busy: false, message: slow ? "The upload took too long. Please check your connection and try again." : "The upload failed. Please check your connection and try again.", error: true });
      }
      const done = await finishUpload(token, itemId, start.path);
      if (done.error) return setState({ busy: false, message: done.error, error: true });
      setState({ busy: false, message: "Received. Thank you.", error: false });
      router.refresh();
    } catch {
      setState({ busy: false, message: "The upload failed. Please check your connection and try again.", error: true });
    }
  }

  return (
    <div className="mt-3">
      <label className={`inline-flex cursor-pointer items-center rounded-lg px-4 py-2 text-sm font-semibold ${state.busy ? "bg-slate-200 text-slate-500" : "bg-navy-800 text-white hover:bg-navy-900"}`}>
        {state.busy ? "Uploading…" : "Choose a file"}
        <input
          type="file"
          className="sr-only"
          disabled={state.busy}
          accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      {state.message && (
        <p role={state.error ? "alert" : "status"} className={`mt-2 text-sm ${state.error ? "text-red-700" : "text-slate-600"}`}>
          {state.message}
        </p>
      )}
    </div>
  );
}
