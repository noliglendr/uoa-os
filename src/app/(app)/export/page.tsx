import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Loading, NotForYourRole, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { Icon } from "@/components/icons";
import { EXPORT_TABLES } from "./tables";

export const metadata: Metadata = { title: "Export" };

// Every table as CSV. Downloads are limited to the attorney and principal, and logged.
export default function ExportPage() {
  return (
    <>
      <PageHeader eyebrow="Firm" icon="download"
        title="Export"
        description="Download any table as a CSV file that opens in Excel. Each download is logged."
      />
      <Suspense fallback={<Loading rows={4} />}>
        <Downloads />
      </Suspense>
    </>
  );
}

async function Downloads() {
  const { staff } = await requireStaff();
  if (staff?.role !== "principal" && staff?.role !== "attorney") return <NotForYourRole who="the attorney and the principal" />;
  return (
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
  );
}
