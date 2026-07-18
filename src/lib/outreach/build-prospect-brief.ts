import { LOOM_OUTLINE, SHARED_WORDING, TONE_PRESETS, type ToneId } from "@/lib/outreach/tone-presets";

export type OutreachFindingStatus = "active" | "verified" | "dismissed";
export type OutreachFindingConfidence = "verified" | "likely" | "manual_review";

/**
 * A finding already narrowed to exactly the fields outreach prep is
 * allowed to see (see the server component's DTO boundary). `key` is
 * a stable local selection key (the finding's real id is fine to use
 * here — it never renders or enters copied output) used only for
 * React keys and the selectedKeys set; it is never printed by any
 * renderer.
 */
export interface OutreachFinding {
  key: string;
  title: string;
  description: string;
  evidence: string | null;
  status: OutreachFindingStatus;
  confidence: OutreachFindingConfidence;
}

export interface OutreachBriefData {
  businessName: string;
  primaryCategory: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  source: "manual" | "google_places";
  searchContext: { niche: string; city: string; state: string } | null;
  websiteDisplayUrl: string | null;
  websiteReachable: boolean | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  googleMapsUrl: string | null;
  auditStatus: "completed" | "partial" | "failed";
  effectiveScore: number;
  auditSummary: string | null;
  homepageTitle: string | null;
  findings: OutreachFinding[];
  screenshotAvailability: { mobile: boolean; desktop: boolean };
  preparedDate: string;
}

export interface ProspectBriefFinding {
  primaryText: string;
  evidence: string | null;
  confidenceLabel: "Verified" | "Likely" | "Manual review";
}

export interface ProspectBrief {
  businessName: string;
  preparedDate: string;
  businessOverviewLines: string[];
  websiteOverviewLines: string[];
  googleProfileLines: string[];
  auditSummaryLines: string[];
  topOpportunities: ProspectBriefFinding[];
  topOpportunitiesEmptyText: string | null;
  supportingEvidence: ProspectBriefFinding[];
  supportingEvidenceEmptyText: string | null;
  itemsToVerify: ProspectBriefFinding[];
  itemsToVerifyEmptyText: string | null;
  screenshotAvailabilityLine: string;
  emailSubjects: [string, string, string];
  opener: string;
  bodyOutline: string[];
  loomOutline: string[];
}

export interface BuildProspectBriefOptions {
  toneId: ToneId;
  selectedKeys: ReadonlySet<string>;
}

function substitute(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(value),
    template,
  );
}

function confidenceLabel(confidence: OutreachFindingConfidence): ProspectBriefFinding["confidenceLabel"] {
  if (confidence === "verified") return "Verified";
  if (confidence === "likely") return "Likely";
  return "Manual review";
}

function toDisplayFinding(finding: OutreachFinding, useEvidence: boolean): ProspectBriefFinding {
  return {
    primaryText: useEvidence ? finding.title : finding.description,
    evidence: useEvidence ? finding.evidence : null,
    confidenceLabel: confidenceLabel(finding.confidence),
  };
}

/**
 * Pure content assembly — no I/O, no fetches, no randomness. Runs
 * identically on the server (never invoked there in this phase) and
 * in the browser, recomputed on every selection/tone change so the
 * preview is always generated fresh from currently-selected data
 * rather than persisted anywhere.
 *
 * Confidence and status are never conflated: a manual_review-
 * confidence finding is routed to `itemsToVerify` ONLY, regardless of
 * its status (including `verified`) — status verified never overrides
 * confidence manual_review or likely. `findingCount` (used in the
 * opener) counts only selected, Top-Opportunities-eligible findings —
 * it never includes manual_review-confidence findings, and is never
 * used to imply priority, severity, or urgency beyond a plain count.
 */
export function buildProspectBrief(data: OutreachBriefData, options: BuildProspectBriefOptions): ProspectBrief {
  const tone = TONE_PRESETS[options.toneId];

  const selected = data.findings.filter((finding) => options.selectedKeys.has(finding.key));

  const itemsToVerifySource = selected.filter((finding) => finding.confidence === "manual_review");
  const opportunitySource = selected.filter((finding) => finding.confidence !== "manual_review");
  const evidenceSource = opportunitySource.filter((finding) => finding.evidence);

  const topOpportunities = opportunitySource.map((f) => toDisplayFinding(f, false));
  const supportingEvidence = evidenceSource.map((f) => toDisplayFinding(f, true));
  const itemsToVerify = itemsToVerifySource.map((f) => toDisplayFinding(f, false));

  const findingCount = topOpportunities.length;

  const findingsClause =
    findingCount > 0
      ? substitute(tone.openerFindingsClause, { findingCount: String(findingCount) })
      : tone.openerZeroFindingsClause;

  const opener = [
    substitute(tone.openerIntro, { businessName: data.businessName }),
    findingsClause,
    tone.openerClosing,
  ].join(" ");

  const emailSubjects = tone.emailSubjects.map((template) =>
    substitute(template, { businessName: data.businessName }),
  ) as [string, string, string];

  return {
    businessName: data.businessName,
    preparedDate: data.preparedDate,
    businessOverviewLines: buildBusinessOverviewLines(data),
    websiteOverviewLines: buildWebsiteOverviewLines(data),
    googleProfileLines: buildGoogleProfileLines(data),
    auditSummaryLines: buildAuditSummaryLines(data),
    topOpportunities,
    topOpportunitiesEmptyText: topOpportunities.length === 0 ? SHARED_WORDING.emptyTopOpportunities : null,
    supportingEvidence,
    supportingEvidenceEmptyText: supportingEvidence.length === 0 ? SHARED_WORDING.emptySupportingEvidence : null,
    itemsToVerify,
    itemsToVerifyEmptyText: itemsToVerify.length === 0 ? SHARED_WORDING.emptyItemsToVerify : null,
    screenshotAvailabilityLine: buildScreenshotLine(data.screenshotAvailability),
    emailSubjects,
    opener,
    bodyOutline: [...tone.bodyOutline],
    loomOutline: [...LOOM_OUTLINE],
  };
}

function buildBusinessOverviewLines(data: OutreachBriefData): string[] {
  const lines: string[] = [data.businessName];
  if (data.primaryCategory) lines.push(data.primaryCategory);

  const location = [data.city, data.state].filter(Boolean).join(", ");
  if (data.address) {
    lines.push(data.address);
  } else if (location) {
    lines.push(location);
  }

  if (data.phone) lines.push(data.phone);

  if (data.source === "google_places" && data.searchContext) {
    lines.push(
      `Found via Google Places search for "${data.searchContext.niche}" in ${data.searchContext.city}, ${data.searchContext.state}.`,
    );
  } else if (data.source === "google_places") {
    lines.push("Found via Google Places.");
  } else {
    lines.push("Manually added.");
  }

  return lines;
}

function buildWebsiteOverviewLines(data: OutreachBriefData): string[] {
  const lines: string[] = [data.websiteDisplayUrl ?? "No website on file."];

  if (data.websiteReachable === true) {
    lines.push("The website was reachable during the recorded audit attempt.");
  } else if (data.websiteReachable === false) {
    lines.push(SHARED_WORDING.unreachableWebsite);
  }

  if (data.homepageTitle) {
    lines.push(`Homepage title: ${data.homepageTitle}`);
  }

  return lines;
}

function buildGoogleProfileLines(data: OutreachBriefData): string[] {
  if (data.googleRating === null && data.googleReviewCount === null && !data.googleMapsUrl) {
    return [SHARED_WORDING.googleDataUnavailable];
  }

  const lines: string[] = [];
  if (data.googleRating !== null) {
    const reviews = data.googleReviewCount !== null ? ` (${data.googleReviewCount} reviews)` : "";
    lines.push(`Rating: ${data.googleRating}${reviews}`);
  }
  if (data.googleMapsUrl) lines.push(data.googleMapsUrl);

  return lines.length > 0 ? lines : [SHARED_WORDING.googleDataUnavailable];
}

function buildAuditSummaryLines(data: OutreachBriefData): string[] {
  const lines: string[] = [];

  if (data.auditStatus === "partial") {
    lines.push(SHARED_WORDING.partialAudit);
  } else if (data.auditStatus === "failed") {
    lines.push(SHARED_WORDING.failedAudit);
  } else if (data.auditSummary) {
    lines.push(data.auditSummary);
  }

  lines.push(`Internal website-opportunity score: ${data.effectiveScore}/100.`);
  lines.push(SHARED_WORDING.scoreCaveat);

  return lines;
}

function buildScreenshotLine(availability: { mobile: boolean; desktop: boolean }): string {
  if (availability.mobile && availability.desktop) return SHARED_WORDING.screenshotsBoth;
  if (availability.mobile) return SHARED_WORDING.screenshotsMobileOnly;
  if (availability.desktop) return SHARED_WORDING.screenshotsDesktopOnly;
  return SHARED_WORDING.screenshotsNone;
}
