import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, documentFileName, makeZip } from "@/lib/documents";

// Every uploaded document of a matter as one ZIP file (the firm owns its files).
// Who may download it is checked, and the download logged, in the database.
export async function GET(_request: Request, ctx: RouteContext<"/matters/[id]/documents-zip">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await createClient();
  const { data: rows, error } = await db.rpc("documents_zip_access", { p_matter: id });
  if (error) return new Response(error.message, { status: error.code === "42501" ? 403 : 500 });
  const { data: matter } = await db.from("matters").select("code").eq("id", id).single();

  const storage = createAdminClient().storage.from(BUCKET);
  const count = new Map<string, number>();
  const files = [];
  for (const r of (rows ?? []) as { storage_path: string; label: string; mime: string; created_at: string; status: string }[]) {
    const { data } = await storage.download(r.storage_path);
    if (!data) continue;
    const n = (count.get(r.label) ?? 0) + 1;
    count.set(r.label, n);
    const folder = r.status === "rejected" ? "Rejected/" : "";
    files.push({ name: folder + documentFileName(r.label, n, r.mime), data: new Uint8Array(await data.arrayBuffer()), date: new Date(r.created_at) });
  }
  const name = `${(matter?.code ?? "matter").replace(/[^A-Za-z0-9._-]+/g, "-")}-documents.zip`;
  return new Response(Buffer.from(makeZip(files)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
