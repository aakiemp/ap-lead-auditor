import type { ProspectBrief, ProspectBriefFinding } from "@/lib/outreach/build-prospect-brief";

/**
 * Renders a ProspectBrief to plain text. Purely mechanical formatting
 * — every content decision (what to say, which empty-state text to
 * use) was already made by buildProspectBrief(); this function only
 * decides how those already-resolved pieces are laid out as text.
 * Never adds, omits, or reinterprets content, so plain-text and
 * markdown output stay factually identical by construction.
 */
export function renderProspectBriefPlainText(brief: ProspectBrief): string {
  const lines: string[] = [];

  lines.push(`PROSPECT BRIEF — ${brief.businessName}`);
  lines.push(`Prepared ${brief.preparedDate}`);
  lines.push("");

  lines.push("BUSINESS OVERVIEW");
  lines.push(...brief.businessOverviewLines);
  lines.push("");

  lines.push("WEBSITE OVERVIEW");
  lines.push(...brief.websiteOverviewLines);
  lines.push("");

  lines.push("GOOGLE PROFILE SUMMARY");
  lines.push(...brief.googleProfileLines);
  lines.push("");

  lines.push("AUDIT SUMMARY");
  lines.push(...brief.auditSummaryLines);
  lines.push("");

  lines.push("TOP OPPORTUNITIES");
  if (brief.topOpportunities.length > 0) {
    lines.push(...brief.topOpportunities.map(formatFindingBullet));
  } else if (brief.topOpportunitiesEmptyText) {
    lines.push(brief.topOpportunitiesEmptyText);
  }
  lines.push("");

  lines.push("SUPPORTING EVIDENCE");
  if (brief.supportingEvidence.length > 0) {
    lines.push(...brief.supportingEvidence.map(formatEvidenceBullet));
  } else if (brief.supportingEvidenceEmptyText) {
    lines.push(brief.supportingEvidenceEmptyText);
  }
  lines.push("");

  lines.push("ITEMS TO VERIFY MANUALLY");
  if (brief.itemsToVerify.length > 0) {
    lines.push(...brief.itemsToVerify.map(formatFindingBullet));
  } else if (brief.itemsToVerifyEmptyText) {
    lines.push(brief.itemsToVerifyEmptyText);
  }
  lines.push("");

  lines.push("SCREENSHOT AVAILABILITY");
  lines.push(brief.screenshotAvailabilityLine);
  lines.push("");

  lines.push("SUGGESTED EMAIL SUBJECTS");
  lines.push(...brief.emailSubjects.map((subject, index) => `${index + 1}. ${subject}`));
  lines.push("");

  lines.push("SUGGESTED OPENER");
  lines.push(brief.opener);
  lines.push("");

  lines.push("SUGGESTED BODY OUTLINE");
  lines.push(...brief.bodyOutline.map((item, index) => `${index + 1}. ${item}`));
  lines.push("");

  lines.push("SUGGESTED LOOM / VIDEO OUTLINE");
  lines.push(...brief.loomOutline.map((item, index) => `${index + 1}. ${item}`));

  return lines.join("\n");
}

function formatFindingBullet(finding: ProspectBriefFinding): string {
  return `- ${finding.primaryText} (${finding.confidenceLabel})`;
}

function formatEvidenceBullet(finding: ProspectBriefFinding): string {
  return `- ${finding.primaryText}: "${finding.evidence}" (${finding.confidenceLabel})`;
}
