import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isToken, sha256 } from "@/lib/documents";

// The client's short session after the code (2 hours, one link only).
export const COOKIE = "uoa_upload";

export type UploadRequest = {
  request_id: string;
  matter_id: string;
  due_date: string;
  expires_at: string;
  items: { id: string; label: string; uploads: { status: string; reject_reason: string | null; created_at: string }[] }[];
};

/** The client's open session for this link: the request and its items, or null. */
export async function loadSession(token: string) {
  if (!isToken(token)) return null;
  const session = (await cookies()).get(COOKIE)?.value;
  if (!session) return null;
  const { data } = await createAdminClient().rpc("doc_session", { p_token_hash: sha256(token), p_session_hash: sha256(session) });
  return data ? { session, request: data as UploadRequest } : null;
}

