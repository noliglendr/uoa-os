import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, documentFileName } from "@/lib/documents";

// Opens one uploaded document (Increment 2). The database checks who may open
// it (attorney, principal, paralegal: D16) and logs it; the server then hands
// out a link that works for 60 seconds.
export async function GET(_request: Request, ctx: RouteContext<"/documents/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await createClient();
  const { data: path, error } = await db.rpc("document_access", { p_document: id });
  if (error || !path) return new Response(error?.message ?? "Not found", { status: error?.code === "42501" ? 403 : 404 });

  const { data: doc } = await db.from("documents").select("item_id, mime, created_at, item:checklist_items(label)").eq("id", id).single();
  const { data: siblings } = await db.from("documents").select("id").eq("item_id", doc?.item_id ?? "").order("created_at");
  const n = (siblings ?? []).findIndex((s) => s.id === id) + 1;
  const label = (doc?.item as unknown as { label?: string } | null)?.label ?? "Document";

  const { data: signed } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(path as string, 60, { download: documentFileName(label, n || 1, doc?.mime ?? "") });
  if (!signed) return new Response("The file could not be opened.", { status: 500 });
  return Response.redirect(signed.signedUrl, 302);
}
