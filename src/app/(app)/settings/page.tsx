import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge, ErrorBanner, Hidden, Loading, NotForYourRole, PageHeader, inputClass } from "@/components/ui";
import { canManage, requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/labels";
import { SectionNav } from "./section-nav";
import { SettingForm } from "./setting-form";

export const metadata: Metadata = { title: "Settings" };

// Open decisions are settings. The principal or an administrator changes them; every change is logged.
export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <>
      <PageHeader eyebrow="Firm" icon="cog" title="Settings" description="How UOA OS works for the firm. Every change is logged." />
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
  // A dropdown whose choices are whole JSON values (sent as JSON, read by the json branch of updateSetting).
  | { kind: "preset"; options: { label: string; value: unknown }[] }
  | { kind: "json" };

type Group = "deadlines" | "matters" | "clients" | "ai" | "billing";

const GROUPS: { id: Group; title: string }[] = [
  { id: "deadlines", title: "Deadlines and reminders" },
  { id: "matters", title: "Matters" },
  { id: "clients", title: "Clients" },
  { id: "ai", title: "AI drafting" },
  { id: "billing", title: "Billing, access and records" },
];

const ON = { kind: "bool", yes: "On", no: "Off" } as const;

/** Each setting: a plain name, at most one short line of help, and its control. Shown in this order. */
const UI: Record<string, { title: string; group: Group; help?: string; control: Control }> = {
  "escalation.recipients": {
    title: "Who gets deadline reminders",
    group: "deadlines",
    control: { kind: "multi", options: { attorney_of_record: "Attorney of record", principal: "Principal", docketing: "Docketing", attorney: "Every attorney", paralegal: "Every paralegal" } },
  },
  "deadline.escalation_days": { title: "Send reminders", group: "deadlines", help: "Days before each deadline, separated by commas.", control: { kind: "numbers", unit: "days before" } },
  "deadline.mailing_extension_days": { title: "Extra time for mailed notices", group: "deadlines", control: { kind: "number", unit: "days" } },
  "followup.receipt_business_days": { title: "Receipt overdue after", group: "deadlines", control: { kind: "number", unit: "business days" } },
  "dashboard.stalled_days": { title: "Matter stalled after", group: "deadlines", help: "Days with nothing logged.", control: { kind: "number", unit: "days" } },
  "followup.emails": { title: "Daily follow-up email to staff", group: "deadlines", control: ON },

  "attorney_of_record.default": { title: "Default attorney of record", group: "matters", help: "Can be changed on each matter.", control: { kind: "choice", options: { principal: "The principal" } } },
  next_phase_new_matter: { title: "Refile or next phase", group: "matters", control: { kind: "bool", yes: "New matter", no: "Same matter" } },
  premium_processing: {
    title: "Premium processing",
    group: "matters",
    control: {
      kind: "preset",
      options: [
        { label: "Ask each time (default No)", value: { mode: "ask_per_matter", default: false } },
        { label: "Ask each time (default Yes)", value: { mode: "ask_per_matter", default: true } },
        { label: "Always", value: { mode: "always", default: true } },
        { label: "Never", value: { mode: "never", default: false } },
      ],
    },
  },

  client_auto_updates: { title: "Automatic messages to clients", group: "clients", help: "Keep off: staff send every message.", control: ON },
  "client_followup.engagement_days": { title: "Remind to sign the engagement after", group: "clients", control: { kind: "number", unit: "days" } },
  "client_followup.documents_days": { title: "Remind about missing documents after", group: "clients", control: { kind: "number", unit: "days" } },
  "documents.link_days": { title: "Upload links last", group: "clients", control: { kind: "number", unit: "days" } },
  "documents.overdue_days": { title: "Flag late documents after", group: "clients", help: "Counted from the due date.", control: { kind: "number", unit: "days" } },

  "drafting.enabled": { title: "AI first drafts of letters", group: "ai", control: ON },
  "drafting.case_facts": { title: "Send case facts to the AI", group: "ai", help: "For RFE/NOID outlines and statements. Made-up matters only for now.", control: ON },

  "billing.invoice_drafts": { title: "Prepare invoice drafts", group: "billing", help: "The attorney approves every invoice.", control: ON },
  delegated_account_access: {
    title: "Staff use of the attorney's USCIS/ECAS accounts",
    group: "billing",
    control: { kind: "choice", options: { off: "Off: the attorney submits", prepare_only: "Prepare only", submit_after_gate: "Submit after approval" } },
  },
  "retention.years_after_close": { title: "Keep closed files for", group: "billing", help: "Never deleted automatically.", control: { kind: "number", unit: "years" } },
};

const ORDER = Object.keys(UI);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Setting = { key: string; value: any; decision: string | null; updated_by: string | null; updated_at: string };

async function Settings() {
  // One database call, alongside the sign-in check.
  const supabase = await createClient();
  const [{ staff }, { data, error }] = await Promise.all([requireStaff(), supabase.rpc("settings_page", {}, { get: true })]);
  if (error) throw new Error(error.message);
  if (!canManage(staff)) return <NotForYourRole who="the principal and administrators" />;
  const names = data.names as Record<string, string>;
  const all = data.settings as Setting[];
  const rows = all.filter((s) => UI[s.key]).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const extra = all.filter((s) => !UI[s.key]);
  const groups = GROUPS.map((g) => ({ ...g, items: rows.filter((s) => UI[s.key].group === g.id) })).filter((g) => g.items.length);

  return (
    <>
      <SectionNav groups={groups.map(({ id, title }) => ({ id, title }))} />

      {[...groups, ...(extra.length ? [{ id: "other", title: "Other", items: extra }] : [])].map((g) => (
        <section key={g.id} id={g.id} className="scroll-mt-36 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-900">{g.title}</h2>
          <ul className="divide-y divide-slate-100">
            {g.items.map((s) => (
              <Row key={s.key} s={s} names={names} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Row({ s, names }: { s: Setting; names: Record<string, string> }) {
  const ui = UI[s.key] ?? { title: s.key, control: { kind: "json" } as Control };
  return (
    <li className="grid items-start gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_20rem] md:gap-8">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900">{ui.title}</h3>
        {ui.help && <p className="mt-0.5 text-sm text-slate-500">{ui.help}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {s.decision && <Badge tone="gold">{s.decision}</Badge>}
          {s.updated_by ? `Changed by ${names[s.updated_by] ?? "?"}, ${formatDateTime(s.updated_at)}` : "Default"}
        </p>
      </div>
      <SettingForm key={JSON.stringify(s.value)}>
        <Hidden values={{ back: "/settings", key: s.key, kind: ui.control.kind }} />
        <Editor control={ui.control} value={s.value} label={ui.title} />
      </SettingForm>
    </li>
  );
}

const choiceChip =
  "cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium text-slate-600 transition has-[:checked]:bg-navy-800 has-[:checked]:text-white has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-300";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Editor({ control, value, label }: { control: Control; value: any; label: string }) {
  switch (control.kind) {
    case "bool":
      return (
        <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          {[
            { v: "true", l: control.yes },
            { v: "false", l: control.no },
          ].map((o) => (
            <label key={o.v} className={choiceChip}>
              <input type="radio" name="value" value={o.v} defaultChecked={String(Boolean(value)) === o.v} className="sr-only" />
              {o.l}
            </label>
          ))}
        </div>
      );
    case "number":
      return (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input name="value" aria-label={label} type="number" min={0} defaultValue={value} className={`${inputClass} w-24 text-right`} />
          {control.unit}
        </label>
      );
    case "numbers":
      return (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input name="value" aria-label={label} defaultValue={(value as number[]).join(", ")} className={`${inputClass} w-44`} />
          {control.unit}
        </label>
      );
    case "choice":
      return (
        <select name="value" aria-label={label} defaultValue={String(value)} className={`${inputClass} w-full`}>
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
        <fieldset aria-label={label} className="flex flex-wrap gap-1.5">
          {Object.entries(control.options).map(([v, l]) => (
            <label
              key={v}
              className="cursor-pointer rounded-full px-3 py-1 text-sm text-slate-600 ring-1 ring-slate-300 transition has-[:checked]:bg-navy-800 has-[:checked]:text-white has-[:checked]:ring-navy-800 has-[:focus-visible]:ring-2"
            >
              <input type="checkbox" name="value" value={v} defaultChecked={(value as string[]).includes(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </fieldset>
      );
    case "preset": {
      const current = control.options.find((o) => same(o.value, value));
      return (
        <select name="value" aria-label={label} defaultValue={JSON.stringify(current?.value ?? value)} className={`${inputClass} w-full`}>
          {control.options.map((o) => (
            <option key={o.label} value={JSON.stringify(o.value)}>
              {o.label}
            </option>
          ))}
          {!current && <option value={JSON.stringify(value)}>{JSON.stringify(value)}</option>}
        </select>
      );
    }
    default:
      return <input name="value" aria-label={label} defaultValue={JSON.stringify(value)} className={`${inputClass} w-full font-mono text-xs sm:text-xs`} />;
  }
}

/** Same JSON value, whatever the key order (the database may reorder object keys). */
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)]))
      : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
