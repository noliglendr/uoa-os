import {
  CHECKLIST_STATUS,
  DECISIONS,
  NOTICE_TYPES,
  POST_DECISION,
  ROLE_LABELS,
  formatDate,
  label,
  stageName,
} from "./labels";

// Turns event-log rows into plain-English sentences for the History tab.
// The raw event stays available (and exported) unchanged.

type Payload = Record<string, unknown> | null | undefined;
type Event = { event_type: string; entity_type: string; payload: Payload };

const ENTITY: Record<string, string> = {
  matter: "matter",
  party: "party",
  filing: "filing",
  response_cycle: "response cycle",
  appearance: "appearance",
  checklist_item: "checklist item",
  notice: "notice",
  deadline: "deadline",
  task: "task",
  deadline_rule: "deadline rule",
  profile: "staff account",
};

const FIELD: Record<string, string> = {
  stage: "stage",
  status: "status",
  label: "name",
  title: "title",
  due_date: "due date",
  attorney_verified: "attorney verified",
  conflict_cleared: "conflict check",
  joint_consent: "joint-representation consent",
  closing_letter_sent: "closing letter sent",
  reschedule_requested: "reschedule requested",
  filed_at: "filed on",
  ref_no: "receipt number",
  decision: "decision",
  client_informed_at: "client told",
  post_decision: "next step",
  receipt_logged_at: "receipt logged",
  urgent: "urgent",
  hard_deadline: "hard deadline",
};

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return formatDate(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** One sentence, without the actor ("approved the strategy memo"). */
export function describeEvent(e: Event): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const changed = (p.changed ?? {}) as Record<string, unknown>;

  switch (e.event_type) {
    case "matter.created":
      return "opened the matter";
    case "matter.stage_changed":
      return `moved the matter to stage ${p.to}: ${stageName(Number(p.to))}`;
    case "engagement.signed":
      return "approved the engagement (retainer signed)";
    case "strategy.approved":
      return "approved the strategy memo and deadline calendar";
    case "packet.locked":
      return "approved the final review and locked the packet";
    case "filing.approved":
      return "approved filing";
    case "filing.submitted":
      return "recorded the filing as submitted";
    case "receipt.logged":
      return "logged the receipt";
    case "notice.received":
      return `logged a ${label(NOTICE_TYPES, String(p.type ?? ""))} notice, routed to ${p.routed_to === "attorney" ? "the attorney" : "docketing"}`;
    case "decision.recorded":
      return `recorded the decision: ${label(DECISIONS, String(p.decision ?? changed.decision ?? ""))}`;
    case "postdecision.opened":
      return `recorded the next step: ${label(POST_DECISION, String(p.post_decision ?? changed.post_decision ?? ""))}`;
    case "matter.closed":
      return "closed the matter";
    case "matter.declined":
      return "declined the matter";
    case "appearance.transferred":
      return "transferred the appearance to a successor matter";
    case "deadline.escalated":
      return `sent the ${p.days_before}-day deadline reminder${p.delivered ? "" : " (not delivered)"}`;
    case "deadline.escalation_failed":
      return `tried to send the ${p.days_before}-day reminder; the email service refused it (retried next run)`;
    case "engagement.alert_sent":
      return "sent the engagement alert (retainer not signed by the alert date)";
    case "engagement.alert_failed":
      return "tried to send the engagement alert; the email service refused it";
    case "sweep.checked":
      return `checked the case status online${p.result ? `: ${p.result}` : ""}`;
    case "export.downloaded":
      return "downloaded an export";
    case "setting.changed":
      return "changed a firm setting";
  }

  const [entity, verb] = e.event_type.split(".");
  const name = ENTITY[entity] ?? entity.replace(/_/g, " ");
  const what = str(p.label ?? p.title ?? p.form_type ?? "");

  if (verb === "created") return `added the ${name}${what ? ` “${what}”` : ""}`;
  if (verb === "updated") {
    const parts = Object.entries(changed).map(([k, v]) => {
      if (k === "status" && entity === "checklist_item") return `status: ${label(CHECKLIST_STATUS, String(v))}`;
      if (k === "owner_role") return `owner: ${ROLE_LABELS[String(v)] ?? v}`;
      return `${FIELD[k] ?? k.replace(/_/g, " ")}: ${str(v)}`;
    });
    return `updated the ${name}${parts.length ? ` (${parts.slice(0, 4).join(", ")})` : ""}`;
  }
  return e.event_type.replace(/[._]/g, " ");
}
