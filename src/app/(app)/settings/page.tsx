import { Suspense } from "react";
import { Badge, Button, Card, ErrorBanner, Hidden, Table, Td, inputClass } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { formatDateTime } from "@/lib/labels";
import { updateSetting } from "../actions";

// Open decisions are settings. Only the principal can change them; every change is logged.
export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const { supabase, staff } = await requireStaff();
  const [{ data: settings }, { data: profiles }] = await Promise.all([
    supabase.from("settings").select("*").order("key"),
    supabase.from("profiles").select("id, display_name"),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]));
  const principal = staff?.role === "principal";

  return (
    <Card title="Firm settings" actions={!principal && <span className="text-sm text-zinc-500">Only the principal can change settings.</span>}>
      <Table head={["Setting", "Meaning", "Value", "Decision", "Last change"]}>
        {(settings ?? []).map((s) => (
          <tr key={s.key}>
            <Td className="font-mono text-xs">{s.key}</Td>
            <Td className="max-w-sm text-xs">{s.description}</Td>
            <Td>
              {principal ? (
                <form action={updateSetting} className="flex gap-1">
                  <Hidden values={{ back: "/settings", key: s.key }} />
                  <input name="value" defaultValue={JSON.stringify(s.value)} className={`${inputClass} w-56 font-mono text-xs`} />
                  <Button className="text-xs">Save</Button>
                </form>
              ) : (
                <code className="text-xs">{JSON.stringify(s.value)}</code>
              )}
            </Td>
            <Td>{s.decision && <Badge tone="amber">{s.decision}</Badge>}</Td>
            <Td className="text-xs text-zinc-500">
              {s.updated_by ? `${names[s.updated_by]} ${formatDateTime(s.updated_at)}` : "Default"}
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
