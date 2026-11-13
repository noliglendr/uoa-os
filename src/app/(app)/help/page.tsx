import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "How it works" };

const STEPS: { icon: IconName; title: string; text: string; href: string; link: string }[] = [
  {
    icon: "home",
    title: "Start on My work",
    text: "Everything waiting for you is at the top, most urgent first. Click a row to see what it is and approve it right there.",
    href: "/",
    link: "Open My work",
  },
  {
    icon: "plus",
    title: "Open a matter",
    text: "Click + New matter. Give it a code, a type and the parties, then clear the conflict check.",
    href: "/matters/new",
    link: "New matter",
  },
  {
    icon: "check",
    title: "Approve the key steps",
    text: "Engagement, strategy, packet and filing (stages 2, 3, 5 and 6) cannot move on without your approval. Each approval is logged with your name.",
    href: "/matters?focus=needs",
    link: "Matters that need you",
  },
  {
    icon: "clock",
    title: "Log every notice",
    text: "When a notice arrives, log it on the matter. UOA OS works out the deadline; you verify it once. Reminders go out at 21, 14, 7, 3 and 1 days.",
    href: "/matters?focus=soon",
    link: "Deadlines in 7 days",
  },
  {
    icon: "chart",
    title: "Check the firm",
    text: "The Firm dashboard shows fees, deadlines met and how long matters take.",
    href: "/dashboard",
    link: "Firm dashboard",
  },
];

const RULES = [
  "UOA OS never files, signs or sends anything to a client. People do, after your approval.",
  "Every change is logged with who and when. Nothing is deleted.",
  "Use made-up codes and role words only until real client data is approved.",
];

export default function HelpPage() {
  return (
    <>
      <PageHeader eyebrow="Help" icon="info" title="How UOA OS works" description="Five steps, from first call to closed file." />

      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-800 text-gold-400">
                <Icon name={s.icon} className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {i + 1}</span>
            </div>
            <h2 className="mt-3 font-semibold text-slate-900">{s.title}</h2>
            <p className="mt-1 flex-1 text-sm text-slate-600">{s.text}</p>
            <Link href={s.href} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline">
              {s.link} <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ol>

      <section className="rounded-xl border border-gold-300 bg-gold-100/40 p-5">
        <h2 className="font-semibold text-slate-900">Three rules</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
          {RULES.map((r) => (
            <li key={r} className="flex gap-2">
              <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-navy-600" />
              {r}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
