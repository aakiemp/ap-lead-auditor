import type { LeadPriority, LeadStatus } from "@/lib/supabase/database.types";

// Display order only — NOT an enforced workflow. Any status may
// transition to any other status (fully permissive); this list drives
// the dashboard's default grouping and the status dropdown's option
// order, nothing else.
export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "reviewing",
  "qualified",
  "outreach_ready",
  "contacted",
  "replied",
  "follow_up",
  "won",
  "lost",
  "not_a_fit",
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  qualified: "Qualified",
  outreach_ready: "Outreach ready",
  contacted: "Contacted",
  replied: "Replied",
  follow_up: "Follow up",
  won: "Won",
  lost: "Lost",
  not_a_fit: "Not a fit",
};

const TERMINAL_STATUSES = new Set<LeadStatus>(["won", "lost", "not_a_fit"]);

export function isTerminalLeadStatus(status: LeadStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export const LEAD_PRIORITIES: LeadPriority[] = ["high", "medium", "low"];

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
