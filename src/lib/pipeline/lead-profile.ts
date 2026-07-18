import { isTerminalLeadStatus } from "@/lib/pipeline/pipeline-status";
import type { LeadProfile, LeadStatus } from "@/lib/supabase/database.types";

/**
 * Every business has exactly one lead_profiles row from the moment it
 * exists (backfilled for existing businesses, auto-created for new
 * ones by a database trigger — see the Phase 11 migration). A missing
 * row is therefore an unexpected state, not the normal representation
 * of status = 'new'. This exists only as a defensive fallback so a
 * page can still render sensibly if that invariant is ever somehow
 * violated — callers should not treat it as the primary path.
 */
export function defaultLeadProfile(businessId: string): LeadProfile {
  return {
    business_id: businessId,
    status: "new",
    priority: null,
    notes: null,
    outreach_angle: null,
    last_contacted_date: null,
    next_follow_up_date: null,
    created_at: "",
    updated_at: "",
  };
}

/**
 * The server's current UTC date, as YYYY-MM-DD. Known simplification:
 * this app has no concept of the operator's timezone (no auth, no
 * user profile) — "today" is computed server-side rather than truly
 * "the user's current local date." For a single-operator tool this is
 * normally equivalent; documented here rather than silently assumed.
 * Defined as its own function (not inlined at a call site) so it can
 * be called from a Server Component without tripping the "no impure
 * calls during render" rule — see CLAUDE.md's Phase 9 note on the
 * same pattern.
 */
export function getTodayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export type FollowUpState = "overdue" | "due_today" | "upcoming";

/**
 * Pure, date-only string comparison (YYYY-MM-DD lexicographic order
 * equals chronological order) — no Date object arithmetic, no
 * timezone conversion. Returns null when there's nothing to show: no
 * follow-up date set, or the lead is in a terminal status (won/lost/
 * not_a_fit never show an overdue badge, regardless of date).
 */
export function getFollowUpState(
  nextFollowUpDate: string | null,
  status: LeadStatus,
  todayISODate: string,
): FollowUpState | null {
  if (!nextFollowUpDate) return null;
  if (isTerminalLeadStatus(status)) return null;

  if (nextFollowUpDate < todayISODate) return "overdue";
  if (nextFollowUpDate === todayISODate) return "due_today";
  return "upcoming";
}
