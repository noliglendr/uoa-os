import { Suspense } from "react";
import { Badge, Button, Card, ErrorBanner, Hidden, Loading, NotForYourRole, PageHeader, inputClass } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

import { formatDateTime } from "@/lib/labels";
import { updateSetting } from "../actions";

// Open decisions are settings. The principal or an administrator changes them; every change is logged.
export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <>
      <PageHeader eyebrow="Firm · Open decisions" icon="cog" title="Settings" description="Firm rules that are open decisions. The principal or an administrator can change them, and every change is logged." />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Settings />
      </Suspense>
    </>
  );
}

type Control =
  | { kind: "bool"; yes: string; no: string }
  | { kind: "number"; unit: string }
  | { kind: "numbers"; unit: string }
  | { kind: "choice"; options: Record<string, string> }
  | { kind: "multi"; options: Record<string, string> }
  | { kind: "json" };

const UI: Record<string, { title: string; group: string; control: Control }> = {
  "escalation.recipients": {
    title: "Who gets deadline reminders",
    group: "Deadlines and reminders",
    control: {
      kind: "multi",
      options: { attorney_of_record: "Attorney of record", principal: "Principal", docketing: "Docketing staff", attorney: "Every attorney", paralegal: "Every paralegal" },
    },
  },
  "deadline.escalation_days": { title: "Reminder days before a deadline", group: "Deadlines and reminders", control: { kind: "numbers", unit: "days before" } },
  "deadline.mailing_extension_days": { title: "Extra days when a notice is mailed", group: "Deadlines and reminders", control: { kind: "number", unit: "days" } },
  "dashboard.stalled_days": { title: "A matter is stalled after", group: "Deadlines and reminders", control: { kind: "number", unit: "quiet days" } },
  "attorney_of_record.default": { title: "Default attorney of record", group: "Matters", control: { kind: "choice", options: { principal: "The principal" } } },
  next_phase_new_matter: { title: "Refile or next phase opens a new matter", group: "Matters", control: { kind: "bool", yes: "Yes, new matter", no: "No, same matter" } },
  premium_processing: { title: "Premium processing", group: "Matters", control: { kind: "json" } },
  delegated_account_access: {
    title: "Staff access to the attorney's USCIS/ECAS accounts",
    group: "Access and clients",
    control: { kind: "choice", options: { off: "Off: staff prepare, the attorney submits", prepare_only: "Prepare only", submit_after_gate: "Submit after attorney approval" } },
  },
  client_auto_updates: { title: "Automatic updates to clients", group: "Access and clients", control: { kind: "bool", yes: "On", no: "Off" } },
  "retention.years_after_close": { title: "Keep closed files for", group: "Records", control: { kind: "number", unit: "years" } },
};

const GROUPS = ["Deadlines and reminders", "Matters", "Access and clients", "Records", "Other"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Setting = { key: string; value: any; description: string | null; decision: string | null; updated_by: string | null; updated_at: string };

async function Settings() {
  // One database call, alongside the sign-in check.
  const supabase = await createClient();
  const [{ staff }, { data, error }] = await Promise.all([requireStaff(), supabase.rpc("settings_page")]);
  if (error) throw error;
  const names = data.names as Record<string, string>;
  const principal = canManage(staff);
  if (!principal) return <NotForYourRole who="the principal and administrators" />;
  const rows = data.settings as Setting[];

  return (
    <>
      {!principal && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">You can see the settings. Only the principal or an administrator can change them.</p>
      )}
      {GROUPS.map((group) => {
        const items = rows.filter((s) => (UI[s.key]?.group ?? "Other") === group);
        if (items.length === 0) return null;
        return (
          <Card key={group} title={group} flush>
            <ul className="divide-y divide-slate-100">
              {items.map((s) => (
                <li key={s.key} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{UI[s.key]?.title ?? s.key}</h3>
                      {s.decision && <Badge tone="gold">{s.decision}</Badge>}
                    </div>
                    {s.description && <p className="mt-1 text-sm text-slate-500">{s.description}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      {s.updated_by ? `Changed by ${names[s.updated_by] ?? "?"}, ${formatDateTime(s.updated_at)}` : "Default value"}
                    </p>
                  </div>
                  <div>
                    {principal ? (
                      <form action={updateSetting} className="space-y-2">
                        <Hidden values={{ back: "/settings", key: s.key, kind: UI[s.key]?.control.kind ?? "json" }} />
                        <Editor control={UI[s.key]?.control ?? { kind: "json" }} value={s.value} />
                        <Button variant="primary">Save</Button>
                      </form>
                    ) : (
                      <p className="text-sm font-medium text-slate-900">{show(UI[s.key]?.control ?? { kind: "json" }, s.value)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Editor({ control, value }: { control: Control; value: any }) {
  switch (control.kind) {
    case "bool":
      return (
        <select name="value" defaultValue={String(Boolean(value))} className={`${inputClass} w-full`}>
          <option value="true">{control.yes}</option>
          <option value="false">{control.no}</option>
        </select>
      );
    case "number":
      return (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input name="value" type="number" min={0} defaultValue={value} className={`${inputClass} w-24`} />
          {control.unit}
        </label>
      );
    case "numbers":
      return (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input name="value" defaultValue={(value as number[]).join(", ")} className={`${inputClass} w-40`} />
          {control.unit}
        </label>
      );
    case "choice":
      return (
        <select name="value" defaultValue={String(value)} className={`${inputClass} w-full`}>
          {Object.entries(control.options).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
          {!(String(value) in control.options) && <option value={String(value)}>{String(value)}</option>}
        </select>
      );
    case "multi":
      return (
        <fieldset className="space-y-1.5">
          {Object.entries(control.options).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="value" value={v} defaultChecked={(value as string[]).includes(v)} className="h-4 w-4 rounded border-slate-300 accent-navy-800" />
              {l}
            </label>
          ))}
        </fieldset>
      );
    default:
      return <input name="value" defaultValue={JSON.stringify(value)} className={`${inputClass} w-full font-mono text-xs`} />;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function show(control: Control, value: any): string {
  switch (control.kind) {
    case "bool":
      return value ? control.yes : control.no;
    case "number":
      return `${value} ${control.unit}`;
    case "numbers":
      return `${(value as number[]).join(", ")} ${control.unit}`;
    case "choice":
      return control.options[String(value)] ?? String(value);
    case "multi":
      return (value as string[]).map((v) => control.options[v] ?? v).join(", ");
    default:
      return JSON.stringify(value);
  }
}
