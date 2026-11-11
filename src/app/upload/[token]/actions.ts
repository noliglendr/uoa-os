"use server";

// The client's side of a document request (Increment 2; decision #31). No staff
// session: every step checks the link, then the code, then the short session
// cookie, in the database. Files go straight from the browser to the private
// bucket through a one-time signed upload URL; the server then checks the
// file's real type and size before it is recorded.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, EXTENSIONS, MAX_BYTES, codeHash, isToken, newSession, sha256, sniffType } from "@/lib/documents";
import { COOKIE, loadSession } from "./session";


function cookiePath(token: string) {
  return `/upload/${token}`;
}

export async function verifyCode(form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!isToken(token)) redirect("/upload/invalid");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const { session, sessionHash } = newSession();
  const { data, error } = await createAdminClient().rpc("doc_verify_code", {
    p_token_hash: sha256(token),
    p_code_hash: codeHash(token, code),
    p_session_hash: sessionHash,
  });
  if (error) redirect(`${cookiePath(token)}?e=error`);
  if (data === "ok") {
    (await cookies()).set(COOKIE, session, {
      path: cookiePath(token),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 2 * 60 * 60,
    });
    redirect(cookiePath(token));
  }
  redirect(`${cookiePath(token)}?e=${encodeURIComponent(String(data))}`);
}

type Start = { error: string } | { path: string; uploadToken: string };

export async function startUpload(token: string, itemId: string, type: string, size: number): Promise<Start> {
  const s = await loadSession(token);
  if (!s) return { error: "Your session ended. Reload the page and enter the code again." };
  if (!s.request.items.some((i) => i.id === itemId)) return { error: "This item is not part of the request." };
  if (!(type in EXTENSIONS)) return { error: "Only PDF, JPG, PNG or HEIC files can be uploaded." };
  if (!(size > 0 && size <= MAX_BYTES)) return { error: "The file is larger than 25 MB." };
  const path = `${s.request.matter_id}/${s.request.request_id}/${randomUUID()}.${EXTENSIONS[type]}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "The upload could not start. Please try again." };
  return { path, uploadToken: data.token };
}

export async function finishUpload(token: string, itemId: string, path: string): Promise<{ error?: string }> {
  const s = await loadSession(token);
  if (!s) return { error: "Your session ended. Reload the page and enter the code again." };
  if (!path.startsWith(`${s.request.matter_id}/${s.request.request_id}/`) || path.includes("..")) return { error: "Wrong file location." };
  const db = createAdminClient();
  const storage = db.storage.from(BUCKET);
  const refuse = async (message: string) => {
    await storage.remove([path]);
    return { error: message };
  };

  // The real size and type, from the stored file itself.
  const { data: info } = await storage.info(path);
  const size = info?.size ?? 0;
  if (!(size > 0 && size <= MAX_BYTES)) return refuse("The file is empty or larger than 25 MB.");
  const { data: signed } = await storage.createSignedUrl(path, 60);
  if (!signed) return refuse("The file could not be checked. Please try again.");
  const head = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-15" } });
  const mime = sniffType(new Uint8Array(await head.arrayBuffer()));
  if (!mime) return refuse("This file is not a PDF, JPG, PNG or HEIC file.");

  const { error } = await db.rpc("record_client_upload", {
    p_token_hash: sha256(token),
    p_session_hash: sha256(s.session),
    p_item: itemId,
    p_path: path,
    p_mime: mime,
    p_size: size,
  });
  if (error) return refuse("The upload could not be recorded. Please try again.");
  return {};
}
