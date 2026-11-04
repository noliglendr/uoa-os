// Display names for database values. One place, so every screen says the same thing.

export const STAGES = [
  { n: 1, name: "Intake and conflicts", owner: "Intake, then Attorney" },
  { n: 2, name: "Engagement", owner: "Attorney only", gate: true },
  { n: 3, name: "Strategy and eligibility", owner: "Attorney only", gate: true },
  { n: 4, name: "Evidence build", owner: "Paralegal, client" },
  { n: 5, name: "Review and sign-off", owner: "Attorney only", gate: true },
  { n: 6, name: "Appearance and filing", owner: "Filing clerk; attorney signs", gate: true },
  { n: 7, name: "Receipt and monitoring", owner: "Docketing" },
  { n: 8, name: "Agency action", owner: "Docketing, then Attorney" },
  { n: 9, name: "Decision", owner: "Attorney" },
  { n: 10, name: "Post-decision", owner: "Attorney" },
  { n: 11, name: "Closure", owner: "Attorney approves" },
] as const;

export const GATE_STAGES = [2, 3, 5, 6] as const;

export const GATE_LABELS: Record<number, string> = {
  2: "Approve engagement (signed retainer, scope, fee phases)",
  3: "Approve strategy memo and deadline calendar",
  5: "Lock packet (final review done, signatures collected)",
  6: "Approve and sign filing",
};

export function stageName(n: number): string {
  return STAGES.find((s) => s.n === n)?.name ?? `Stage ${n}`;
}

export const ROLE_LABELS: Record<string, string> = {
  principal: "Principal",
  attorney: "Attorney",
  paralegal: "Paralegal",
  docketing: "Docketing",
  intake: "Intake",
  administrator: "Administrator",
};

export const MATTER_TYPES: Record<string, string> = {
  petition: "Petition",
  application: "Application",
  eoir_litigation: "EOIR litigation",
  federal: "Federal",
};

export const MATTER_STATUS: Record<string, string> = {
  prospect: "Prospect",
  active: "Active",
  declined: "Declined",
  closed: "Closed",
};

export const FORUMS: Record<string, string> = {
  uscis: "USCIS",
  cbp: "CBP",
  ice: "ICE",
  immigration_court: "Immigration court (EOIR)",
  bia: "BIA",
  circuit_court: "Circuit court",
};

export const APPEARANCE_FORMS: Record<string, string> = {
  g28: "G-28",
  eoir28: "EOIR-28",
  eoir27: "EOIR-27",
  circuit: "Circuit court appearance",
};

/** The appearance form each forum requires (redline 6). */
export const FORM_FOR_FORUM: Record<string, string> = {
  uscis: "g28",
  cbp: "g28",
  ice: "g28",
  immigration_court: "eoir28",
  bia: "eoir27",
  circuit_court: "circuit",
};

export const NOTICE_TYPES: Record<string, string> = {
  receipt: "Receipt",
  rfe: "RFE",
  noid: "NOID",
  biometrics: "Biometrics",
  interview: "Interview",
  hearing: "Hearing",
  decision: "Decision",
  order: "Order",
  transfer: "Transfer",
  other: "Other",
};

export const CHANNELS: Record<string, string> = {
  mail: "Mail",
  online: "Online account",
  email: "Email",
  court: "Court (ECAS)",
  hand: "By hand",
  other: "Other",
};

export const PARTY_ROLES: Record<string, string> = {
  petitioner: "Petitioner",
  beneficiary: "Beneficiary",
  applicant: "Applicant",
  respondent: "Respondent",
  derivative: "Derivative",
  other: "Other",
};

export const CHECKLIST_OWNERS: Record<string, string> = {
  client: "Client",
  firm: "Firm",
  third_party: "Third party",
};

export const CHECKLIST_STATUS: Record<string, string> = {
  needed: "Needed",
  requested: "Requested",
  received: "Received",
  drafted: "Drafted",
  attorney_review: "Attorney review",
  approved: "Approved",
  waived: "Waived",
};

export const DECISIONS: Record<string, string> = {
  approved: "Approved",
  denied: "Denied",
  granted: "Granted",
  dismissed: "Dismissed",
  withdrawn: "Withdrawn",
  remanded: "Remanded",
  other: "Other",
};

export const POST_DECISION: Record<string, string> = {
  approval_delivered: "Approval delivered to client",
  motion: "Motion (same matter)",
  appeal: "Appeal (same matter)",
  refile: "Refile (new matter)",
  new_matter: "Next phase (new matter)",
  none: "Nothing further",
};

export const CYCLE_KINDS: Record<string, string> = {
  rfe: "RFE response",
  noid: "NOID response",
  i290b: "I-290B",
  motion: "Motion",
  appeal: "Appeal",
  other: "Other response",
};

export function label(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "";
  return map[value] ?? value;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
