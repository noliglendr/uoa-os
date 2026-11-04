import { Suspense } from "react";
import { Button, Card, ErrorBanner, Field, inputClass } from "@/components/ui";
import { MATTER_TYPES, PARTY_ROLES } from "@/lib/labels";
import { createMatter } from "../../actions";

// Stage 1 intake: matter type, urgency, parties for the conflict check.
export default function NewMatterPage({ searchParams }: PageProps<"/matters/new">) {
  return (
    <>
      <h1 className="text-2xl font-semibold">New matter (intake)</h1>
      <Suspense fallback={null}>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>
      <Card title="Matter">
        <form action={createMatter} className="grid max-w-2xl gap-4">
          <p className="rounded bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Use synthetic codes and role labels only. No client names, A-numbers, receipt numbers or case facts.
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
              <input type="checkbox" name="urgent" /> Urgent
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="hard_deadline" /> Hard deadline already running
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            EOIR and federal matters always count as hard-deadline matters: the attorney verifies the deadline at intake,
            before engagement.
          </p>
          <Field label="Engagement alert date" hint="Escalate if the retainer is not signed by this date">
            <input type="date" name="engagement_alert_date" className={`${inputClass} w-48`} />
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Parties (conflicts are checked for each)</legend>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2">
                <input name={`party_label_${i}`} placeholder={`Client ${i + 1}`} required={i === 0} className={`${inputClass} flex-1`} />
                <select name={`party_role_${i}`} className={inputClass} defaultValue={i === 1 ? "beneficiary" : "petitioner"}>
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
