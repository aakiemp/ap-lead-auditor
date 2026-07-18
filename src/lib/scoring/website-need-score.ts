import type { GeneratedFinding } from "@/lib/audit/generate-findings";

export interface ScoreBreakdownEntry {
  ruleId: string;
  label: string;
  points: number;
}

export interface WebsiteNeedScoreResult {
  score: number;
  breakdown: ScoreBreakdownEntry[];
}

/**
 * Sums each finding's points into a total website-need score, with a
 * per-rule breakdown for display. Pure function — no I/O. Findings are
 * generated with non-overlapping rules (see generate-findings.ts), so
 * no double-counting logic is needed here.
 */
export function calculateWebsiteNeedScore(findings: GeneratedFinding[]): WebsiteNeedScoreResult {
  const breakdown: ScoreBreakdownEntry[] = findings.map((finding) => ({
    ruleId: finding.ruleId,
    label: finding.title,
    points: finding.points,
  }));

  const score = breakdown.reduce((sum, entry) => sum + entry.points, 0);

  return { score, breakdown };
}
