import type { AuditFinding } from "@/lib/supabase/database.types";

export interface EffectiveScoreBreakdownEntry {
  ruleId: string;
  label: string;
  points: number;
}

export interface EffectiveScoreResult {
  score: number;
  breakdown: EffectiveScoreBreakdownEntry[];
}

/**
 * Computes the current, effective website-need score from stored
 * findings: sums points from every finding whose status is not
 * "dismissed" (active and verified both count in full). Pure
 * function — no I/O.
 *
 * audit_scores.website_need_score is never mutated (see CLAUDE.md —
 * audits/audit_scores stay immutable). This function is called fresh
 * on every page render and every copy-summary build, so the displayed
 * and copied score always reflect the current finding statuses without
 * ever writing to the stored score row.
 */
export function calculateEffectiveScore(findings: AuditFinding[]): EffectiveScoreResult {
  const counted = findings.filter((finding) => finding.status !== "dismissed");

  const breakdown: EffectiveScoreBreakdownEntry[] = counted.map((finding) => ({
    ruleId: finding.rule_id ?? finding.finding_type,
    label: finding.title,
    points: finding.points,
  }));

  const score = breakdown.reduce((sum, entry) => sum + entry.points, 0);

  return { score, breakdown };
}
