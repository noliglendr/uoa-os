import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { EXPORT_TABLES } from "./tables";

// Every table as CSV. Downloads are limited to the attorney and principal, and logged.
export default function ExportPage() {
  return (
    <>
      <PageHeader
        title="Export"
        description="The firm owns its data. Each file holds the full table and opens in Excel. Downloads are for the attorney and principal, and each one is recorded in the history."
      />
      <Card title="Download as CSV" flush>
        <ul className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
          {EXPORT_TABLES.map((t) => (
            <li key={t.table}>
              <a href={`/export/${t.table}`} download className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                  <Icon name="download" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-slate-900">{t.label}</span>
                  <span className="block text-xs text-slate-500">{t.table}.csv</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
