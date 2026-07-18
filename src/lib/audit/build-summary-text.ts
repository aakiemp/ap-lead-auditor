import type { NormalizedPageSpeed } from "@/lib/audit/normalize-pagespeed";
import type { EffectiveScoreBreakdownEntry } from "@/lib/scoring/effective-score";
import type { AuditFinding, Business, Website } from "@/lib/supabase/database.types";

export interface BuildSummaryTextInput {
  business: Business;
  website: Website | null;
  pagespeed: NormalizedPageSpeed | null;
  effectiveScore: number;
  effectiveBreakdown: EffectiveScoreBreakdownEntry[];
  verifiedFindings: AuditFinding[];
  activeFindings: AuditFinding[];
  manualReviewFindings: AuditFinding[];
  dismissedFindings: AuditFinding[];
}

/**
 * Builds the plain-text "Copy audit for ChatGPT or Claude" output from
 * already-fetched data. Pure function — no I/O, no database access.
 *
 * Never includes: raw PageSpeed JSON, any UUID, error_message values,
 * or database/schema details. Every field here is either a
 * human-readable business fact or a finding's evidence-based
 * description text, matching the evidence-based wording rules in
 * CLAUDE.md.
 */
export function buildAuditSummaryText(input: BuildSummaryTextInput): string {
  const lines: string[] = [];

  lines.push("Analyze this business as a potential website redesign, optimization, or maintenance prospect.");
  lines.push("");

  lines.push("Business:");
  lines.push(input.business.name);
  lines.push("");

  lines.push("Website:");
  lines.push(input.website?.final_url ?? input.website?.input_url ?? "Not available");
  lines.push("");

  const location = [input.business.city, input.business.state].filter(Boolean).join(", ");
  if (location) {
    lines.push("Location:");
    lines.push(location);
    lines.push("");
  }

  lines.push("Reachability:");
  lines.push(describeReachability(input.website));
  lines.push("");

  lines.push("Mobile PageSpeed scores:");
  if (input.pagespeed) {
    lines.push(`Performance: ${formatScore(input.pagespeed.performanceScore)}/100`);
    lines.push(`Accessibility: ${formatScore(input.pagespeed.accessibilityScore)}/100`);
    lines.push(`SEO: ${formatScore(input.pagespeed.seoScore)}/100`);
    lines.push(`Best Practices: ${formatScore(input.pagespeed.bestPracticesScore)}/100`);
  } else {
    lines.push(describeMissingPagespeed(input.website));
  }
  lines.push("");

  if (input.pagespeed) {
    lines.push("Core Web Vitals (mobile):");
    lines.push(`First Contentful Paint: ${input.pagespeed.firstContentfulPaintDisplay ?? "—"}`);
    lines.push(`Largest Contentful Paint: ${input.pagespeed.largestContentfulPaintDisplay ?? "—"}`);
    lines.push(`Cumulative Layout Shift: ${input.pagespeed.cumulativeLayoutShiftDisplay ?? "—"}`);
    lines.push(`Total Blocking Time: ${input.pagespeed.totalBlockingTimeDisplay ?? "—"}`);
    lines.push(`Speed Index: ${input.pagespeed.speedIndexDisplay ?? "—"}`);
    lines.push("");
  }

  lines.push("Website-need score:");
  lines.push(String(input.effectiveScore));
  if (input.dismissedFindings.length > 0) {
    const count = input.dismissedFindings.length;
    lines.push(
      `Note: ${count} finding${count === 1 ? "" : "s"} ${
        count === 1 ? "was" : "were"
      } dismissed and excluded from this score — see Dismissed findings below.`,
    );
  }
  lines.push("");

  lines.push("Score breakdown:");
  if (input.effectiveBreakdown.length > 0) {
    for (const entry of input.effectiveBreakdown) {
      lines.push(`* ${entry.label}: +${entry.points}`);
    }
  } else {
    lines.push("No point-earning findings.");
  }
  lines.push("");

  appendFindingSection(lines, "Verified findings", input.verifiedFindings);
  appendFindingSection(lines, "Active findings (not yet manually reviewed)", input.activeFindings);
  appendFindingSection(lines, "Manual review needed", input.manualReviewFindings);
  appendFindingSection(
    lines,
    "Dismissed findings (excluded from the score above)",
    input.dismissedFindings,
  );

  lines.push("Please provide:");
  lines.push("");
  lines.push("1. The three strongest outreach angles");
  lines.push("2. The likely business impact of each issue");
  lines.push("3. Any claims that should not be used without further verification");
  lines.push("4. A concise personalized email opener");
  lines.push("5. A short Loom audit outline");

  return lines.join("\n");
}

function describeReachability(website: Website | null): string {
  if (!website || website.is_reachable === null) return "Not yet checked.";
  if (website.is_reachable) {
    return website.http_status
      ? `Reachable (HTTP status ${website.http_status}).`
      : "Reachable.";
  }
  return website.failure_reason
    ? `Not reachable — failure reason recorded: ${website.failure_reason}.`
    : "Not reachable.";
}

function describeMissingPagespeed(website: Website | null): string {
  if (website?.is_reachable === false) {
    return "Not available — the PageSpeed check was not run because the website was not reachable.";
  }
  if (website?.is_reachable === true) {
    return "Not available — the PageSpeed check failed after retries.";
  }
  return "Not available.";
}

function appendFindingSection(lines: string[], heading: string, findings: AuditFinding[]): void {
  if (findings.length === 0) return;
  lines.push(`${heading}:`);
  for (const finding of findings) {
    lines.push(`* ${finding.description}`);
  }
  lines.push("");
}

function formatScore(value: number | null): string {
  return value === null ? "—" : String(value);
}
