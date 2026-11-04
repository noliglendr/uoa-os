import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/deadlines";
import { EXPORT_TABLES } from "../tables";

// CSV download of one table, read as the signed-in user (row-level security applies).
export async function GET(_request: Request, ctx: RouteContext<"/export/[table]">) {
  const { table } = await ctx.params;
  const spec = EXPORT_TABLES.find((t) => t.table === table);
  if (!spec) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_app_role");
  if (role !== "principal" && role !== "attorney") {
    return new Response("Only the attorney or principal can export data.", { status: 403 });
  }

  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").order(spec.order).range(from, from + 999);
    if (error) return new Response(error.message, { status: 500 });
    rows.push(...data);
    if (data.length < 1000) break;
  }

  await supabase.rpc("log_event", {
    p_event_type: "export.downloaded",
    p_entity_type: "export",
    p_entity_id: table,
    p_payload: { rows: rows.length },
  });

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="uoa-os-${table}-${today()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    if (v == null) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    // Stop spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}
