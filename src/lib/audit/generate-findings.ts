import type { NormalizedPageSpeed } from "@/lib/audit/normalize-pagespeed";
import type {
  FindingCategory,
  FindingConfidence,
  FindingSeverity,
} from "@/lib/supabase/database.types";

export interface GeneratedFinding {
  category: FindingCategory;
  findingType: string;
  title: string;
  description: string;
  evidence: string | null;
  sourceType: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  points: number;
  ruleId: string;
}

export interface WebsiteFactsForFindings {
  isReachable: boolean | null;
  httpsEnabled: boolean | null;
  failureReason: string | null;
}

const PERFORMANCE_LOW_THRESHOLD = 30;
const PERFORMANCE_MEDIUM_THRESHOLD = 49;
const ACCESSIBILITY_THRESHOLD = 70;
const SEO_THRESHOLD = 70;
const BEST_PRACTICES_THRESHOLD = 70;

/**
 * Findings generated when a website could not be reached, so no
 * PageSpeed check was attempted. Pure function — no I/O.
 */
export function generateUnreachableFinding(website: WebsiteFactsForFindings): GeneratedFinding[] {
  return [
    {
      category: "technical",
      findingType: "website_unreachable",
      title: "Website unreachable",
      description: website.failureReason
        ? `The website could not be reached. Failure reason recorded: ${website.failureReason}.`
        : "The website could not be reached.",
      evidence: website.failureReason,
      sourceType: "reachability_check",
      severity: "critical",
      confidence: "verified",
      points: 35,
      ruleId: "website_unreachable",
    },
  ];
}

/**
 * Findings generated for a reachable website from already-known
 * website facts (Phase 3) plus normalized PageSpeed mobile data
 * (Phase 4). Pure function — no I/O. Only one mobile-performance
 * range rule can trigger, by construction (if/else if below).
 */
export function generateReachableFindings(
  website: WebsiteFactsForFindings,
  pagespeed: NormalizedPageSpeed,
): GeneratedFinding[] {
  const findings: GeneratedFinding[] = [];

  if (website.httpsEnabled === false) {
    findings.push({
      category: "technical",
      findingType: "no_https",
      title: "HTTPS not enabled",
      description: "The final resolved URL uses http rather than https.",
      evidence: null,
      sourceType: "reachability_check",
      severity: "high",
      confidence: "verified",
      points: 20,
      ruleId: "no_https",
    });
  }

  if (pagespeed.performanceScore !== null) {
    if (pagespeed.performanceScore < PERFORMANCE_LOW_THRESHOLD) {
      findings.push({
        category: "performance",
        findingType: "mobile_performance_low",
        title: "Low mobile performance score",
        description: `Google PageSpeed Insights measured a mobile performance score of ${pagespeed.performanceScore} out of 100.`,
        evidence: String(pagespeed.performanceScore),
        sourceType: "pagespeed",
        severity: "critical",
        confidence: "verified",
        points: 25,
        ruleId: "mobile_performance_below_30",
      });
    } else if (pagespeed.performanceScore <= PERFORMANCE_MEDIUM_THRESHOLD) {
      findings.push({
        category: "performance",
        findingType: "mobile_performance_medium",
        title: "Below-average mobile performance score",
        description: `Google PageSpeed Insights measured a mobile performance score of ${pagespeed.performanceScore} out of 100.`,
        evidence: String(pagespeed.performanceScore),
        sourceType: "pagespeed",
        severity: "high",
        confidence: "verified",
        points: 15,
        ruleId: "mobile_performance_30_to_49",
      });
    }
  }

  if (pagespeed.accessibilityScore !== null && pagespeed.accessibilityScore < ACCESSIBILITY_THRESHOLD) {
    findings.push({
      category: "accessibility",
      findingType: "accessibility_score_low",
      title: "Low accessibility score",
      description: `Google PageSpeed Insights measured a mobile accessibility score of ${pagespeed.accessibilityScore} out of 100.`,
      evidence: String(pagespeed.accessibilityScore),
      sourceType: "pagespeed",
      severity: "medium",
      confidence: "verified",
      points: 10,
      ruleId: "accessibility_below_70",
    });
  }

  if (pagespeed.seoScore !== null && pagespeed.seoScore < SEO_THRESHOLD) {
    findings.push({
      category: "seo",
      findingType: "seo_score_low",
      title: "Low SEO score",
      description: `Google PageSpeed Insights measured a mobile SEO score of ${pagespeed.seoScore} out of 100.`,
      evidence: String(pagespeed.seoScore),
      sourceType: "pagespeed",
      severity: "medium",
      confidence: "verified",
      points: 8,
      ruleId: "seo_below_70",
    });
  }

  if (pagespeed.bestPracticesScore !== null && pagespeed.bestPracticesScore < BEST_PRACTICES_THRESHOLD) {
    findings.push({
      category: "technical",
      findingType: "best_practices_score_low",
      title: "Low best-practices score",
      description: `Google PageSpeed Insights measured a mobile best-practices score of ${pagespeed.bestPracticesScore} out of 100.`,
      evidence: String(pagespeed.bestPracticesScore),
      sourceType: "pagespeed",
      severity: "medium",
      confidence: "verified",
      points: 8,
      ruleId: "best_practices_below_70",
    });
  }

  return findings;
}
