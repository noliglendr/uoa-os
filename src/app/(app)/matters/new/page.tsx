import type { Metadata } from "next";
import { Suspense } from "react";
import { Button, Card, ErrorBanner, Field, PageHeader, inputClass } from "@/components/ui";
import { MATTER_TYPES, PARTY_ROLES } from "@/lib/labels";
import { createMatter } from "../../actions";

export const metadata: Metadata = { title: "New matter" };

// Stage 1 intake: matter type, urgency, parties for the conflict check.
export default function NewMatterPage({ searchParams }: PageProps<"/matters/new">) {
  return (
    <>
      <PageHeader eyebrow="Work" icon="plus" title="New matter" description="Start a matter at intake." />
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Card title="Matter details">
        <form action={createMatter} className="grid max-w-2xl gap-5">
          <p className="rounded-lg border border-gold-300 bg-gold-100/60 px-3 py-2 text-sm text-slate-800">
            Made-up codes and role words only: no client names or case numbers.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Matter code" hint='For example "Matter D"'>
              <input name="code" required maxLength={40} className={inputClass} />
            </Field>
            <Field label="Matter type">
              <select name="matter_type" required className={inputClass}>
                {Object.entries(MATTER_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Summary" hint="The work, in a few words (for example: EB-2 NIW petition)">
            <input name="summary" required className={inputClass} />
          </Field>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="urgent" className="h-4 w-4 accent-navy-800" /> Urgent
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="hard_deadline" className="h-4 w-4 accent-navy-800" /> Hard deadline already running
            </label>
          </div>
          <p className="text-xs text-slate-500">
            EOIR and federal matters always count as hard-deadline matters: the attorney verifies the deadline at intake,
            before engagement.
          </p>
          <Field label="Engagement alert date" hint="Escalate if the retainer is not signed by this date">
            <input type="date" name="engagement_alert_date" className={`${inputClass} w-48`} />
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">Parties (conflicts are checked for each)</legend>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2">
                <input name={`party_label_${i}`} aria-label={`Party ${i + 1} role label`} placeholder={`Client ${i + 1}`} required={i === 0} className={`${inputClass} flex-1`} />
                <select name={`party_role_${i}`} aria-label={`Party ${i + 1} role`} className={inputClass} defaultValue={i === 1 ? "beneficiary" : "petitioner"}>
                  {Object.entries(PARTY_ROLES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </fieldset>
          <div>
            <Button variant="primary">Open matter</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
