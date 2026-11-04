// Tables the firm can export as CSV at any time (CLAUDE.md rule 7).
export const EXPORT_TABLES = [
  { table: "matters", label: "Matters", order: "code" },
  { table: "parties", label: "Parties (role labels)", order: "created_at" },
  { table: "appearances", label: "Appearances", order: "created_at" },
  { table: "filings", label: "Filings", order: "created_at" },
  { table: "response_cycles", label: "Response cycles", order: "created_at" },
  { table: "gates", label: "Attorney approvals", order: "id" },
  { table: "notices", label: "Notices", order: "logged_at" },
  { table: "deadlines", label: "Deadlines", order: "due_date" },
  { table: "escalations", label: "Reminders sent", order: "id" },
  { table: "tasks", label: "Tasks", order: "created_at" },
  { table: "checklist_items", label: "Evidence checklist", order: "created_at" },
  { table: "deadline_rules", label: "Deadline rules", order: "code" },
  { table: "settings", label: "Settings", order: "key" },
  { table: "profiles", label: "Staff", order: "created_at" },
  { table: "event_log", label: "Event log (full history)", order: "id" },
] as const;
