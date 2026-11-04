import { Card } from "@/components/ui";
import { EXPORT_TABLES } from "./tables";

// Every table as CSV. Downloads are limited to the attorney and principal, and logged.
export default function ExportPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Export</h1>
      <Card title="Download as CSV">
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          The firm owns its data. Each file holds the full table. Downloads are for the attorney and principal, and each
          one is recorded in the event log.
        </p>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {EXPORT_TABLES.map((t) => (
            <li key={t.table}>
              <a href={`/export/${t.table}`} className="underline" download>
                {t.label}
              </a>{" "}
              <span className="text-xs text-zinc-500">{t.table}.csv</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
