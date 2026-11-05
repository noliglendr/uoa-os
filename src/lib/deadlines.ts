// Deadline calculation: the one place where due dates are computed.
// Pure functions (no database, no clock unless passed in), so every rule is unit-tested.
// Dates are plain "YYYY-MM-DD" strings in the firm's calendar.
//
// Rules come from the deadline_rules table (draft in docs/deadline-rules.md).
// None is relied on until the attorney verifies it (D7): unverified rules
// always produce a warning.

export type DeadlineKind = "response" | "appointment" | "review";

export type DeadlineRule = {
  code: string;
  label: string;
  kind: DeadlineKind;
  /** Window in days. Null = the date on the notice controls. */
  days: number | null;
  /** Rule allows the mailing extension (+3 days when the notice was mailed). */
  mailingExtension: boolean;
  /** Appointments: prep task this many days before. */
  prepDays: number | null;
  attorneyVerified: boolean;
};

export type DeadlineInput = {
  rule: DeadlineRule | null;
  /** Start of the window: notice date, decision date or order date. */
  triggerDate: string | null;
  /** Due date or appointment date printed on the notice, if any. It always wins. */
  noticeDate?: string | null;
  /** The notice was served by mail (toggle on the deadline). */
  mailed: boolean;
  /** Setting deadline.mailing_extension_days. */
  mailingExtensionDays: number;
};

export type ComputedDeadline = {
  kind: DeadlineKind;
  /** Date before moving off a weekend or holiday. File by the earlier date. */
  rawDueDate: string;
  dueDate: string;
  mailingExtension: boolean;
  prepDate: string | null;
  warnings: string[];
};

export const FIRM_TIME_ZONE = "America/Chicago";

const DAY_MS = 86_400_000;

function toTime(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}`);
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== date) throw new Error(`Invalid date: ${date}`);
  return t;
}

function fromTime(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromTime(toTime(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

function ymd(year: number, month: number, day: number): string {
  return fromTime(Date.UTC(year, month - 1, day));
}

/** nth weekday (0 = Sunday) of a month; n = -1 for the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return ymd(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(year, month, 0));
  const back = (lastDay.getUTCDay() - weekday + 7) % 7;
  return ymd(year, month, lastDay.getUTCDate() - back);
}

/** Fixed-date holidays move to Friday when on Saturday, Monday when on Sunday. */
function observed(date: string): string {
  const day = new Date(toTime(date)).getUTCDay();
  return day === 6 ? addDays(date, -1) : day === 0 ? addDays(date, 1) : date;
}

const holidayCache = new Map<number, Set<string>>();

/** U.S. federal holidays (5 U.S.C. 6103), observed dates. */
export function federalHolidays(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set([
      observed(ymd(year, 1, 1)),
      nthWeekday(year, 1, 1, 3), // Birthday of Martin Luther King, Jr.
      nthWeekday(year, 2, 1, 3), // Washington's Birthday
      nthWeekday(year, 5, 1, -1), // Memorial Day
      observed(ymd(year, 6, 19)), // Juneteenth
      observed(ymd(year, 7, 4)),
      nthWeekday(year, 9, 1, 1), // Labor Day
      nthWeekday(year, 10, 1, 2), // Columbus Day
      observed(ymd(year, 11, 11)), // Veterans Day
      nthWeekday(year, 11, 4, 4), // Thanksgiving
      observed(ymd(year, 12, 25)),
    ]);
    // Next year's January 1 can be observed on December 31 of this year.
    const nextNewYear = observed(ymd(year + 1, 1, 1));
    if (nextNewYear.startsWith(String(year))) set.add(nextNewYear);
    holidayCache.set(year, set);
  }
  return set;
}

export function isBusinessDay(date: string): boolean {
  const day = new Date(toTime(date)).getUTCDay();
  if (day === 0 || day === 6) return false;
  return !federalHolidays(Number(date.slice(0, 4))).has(date);
}

/** The date itself if it is a business day, otherwise the next business day. */
export function nextBusinessDay(date: string): string {
  let d = date;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

/** The date itself if it is a business day, otherwise the business day before. */
export function previousBusinessDay(date: string): string {
  let d = date;
  while (!isBusinessDay(d)) d = addDays(d, -1);
  return d;
}

export function computeDeadline(input: DeadlineInput): ComputedDeadline {
  const { rule, triggerDate, noticeDate, mailed, mailingExtensionDays } = input;
  const warnings: string[] = [];
  const kind: DeadlineKind = rule?.kind ?? "response";

  if (!rule) {
    warnings.push("No rule: the date was entered by hand. The attorney must verify it.");
  } else if (!rule.attorneyVerified) {
    warnings.push(`Rule ${rule.code} is not verified by the attorney yet (D7).`);
  }

  const extension = Boolean(mailed && rule?.mailingExtension);
  let computed: string | null = null;
  if (rule?.days != null) {
    if (!triggerDate) throw new Error(`Rule ${rule.code} counts from a start date: fill in "Start date" (the notice, decision or order date).`);
    computed = addDays(triggerDate, rule.days + (extension ? mailingExtensionDays : 0));
  }

  let rawDueDate: string;
  if (noticeDate) {
    rawDueDate = noticeDate;
    toTime(noticeDate);
    if (computed && computed !== noticeDate) {
      warnings.push(`The notice date (${noticeDate}) differs from the rule (${computed}). The notice date is used.`);
    }
    if (triggerDate && daysBetween(triggerDate, noticeDate) < 0) {
      throw new Error("The due date is before the start date");
    }
  } else if (computed) {
    rawDueDate = computed;
  } else {
    throw new Error(
      rule
        ? `Rule ${rule.code} uses the date on the notice: fill in "Date on the notice".`
        : 'With "No rule", fill in "Date on the notice" (the due date).',
    );
  }

  // Appointments keep their exact date; filing deadlines move off weekends and holidays.
  const dueDate = kind === "appointment" ? rawDueDate : nextBusinessDay(rawDueDate);
  if (dueDate !== rawDueDate) {
    warnings.push(`${rawDueDate} is a weekend or holiday. Shown as ${dueDate}; file by ${rawDueDate} to be safe.`);
  }

  const prepDate =
    kind === "appointment" && rule?.prepDays ? previousBusinessDay(addDays(rawDueDate, -rule.prepDays)) : null;

  return { kind, rawDueDate, dueDate, mailingExtension: extension, prepDate, warnings };
}

/** Today's date in the firm's time zone. */
export function today(now: Date = new Date(), timeZone: string = FIRM_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Which reminder to send now (R2). Thresholds are days before the due date,
 * for example [21, 14, 7, 3, 1]. If the job missed a day, the closest missed
 * threshold is sent once and every larger one counts as covered.
 * Returns null when nothing is due.
 */
export function escalationDue(
  daysLeft: number,
  thresholds: number[],
  alreadySent: number[],
): { send: number; markSent: number[] } | null {
  const sent = new Set(alreadySent);
  const reached = [...new Set(thresholds)].filter((t) => t >= daysLeft && !sent.has(t)).sort((a, b) => a - b);
  if (reached.length === 0) return null;
  // Overdue deadlines: send the smallest threshold (usually 1) once.
  return { send: reached[0], markSent: reached };
}

/** Plain-English countdown for the dashboard. */
export function describeDue(dueDate: string, todayDate: string): string {
  const d = daysBetween(todayDate, dueDate);
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} overdue`;
  if (d === 0) return "due today";
  return `in ${d} day${d === 1 ? "" : "s"}`;
}
