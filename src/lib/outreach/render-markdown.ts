import type { ProspectBrief, ProspectBriefFinding } from "@/lib/outreach/build-prospect-brief";

// Characters that could otherwise create unintended emphasis, code
// spans, links, headings, or raw HTML when business/finding text is
// embedded in markdown. All business- and finding-derived text is
// treated as untrusted plain text and escaped through this before
// being placed in the output — including this module's own fixed
// section headings would be safe too, but they're authored literals
// known not to contain any of these characters, so escaping is only
// applied where content actually originates from stored records.
const MARKDOWN_ESCAPE_PATTERN = /[\\`*_[\]<>#|]/g;

function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_ESCAPE_PATTERN, (char) => `\\${char}`);
}

// Website/Google Maps URLs are structured, already-validated data
// (see normalize-url.ts), not free-form prose — escaping them would
// risk corrupting a literal, copyable URL (e.g. a real "_" or "#" in
// a path/fragment) for negligible safety benefit, since they can't
// contain arbitrary HTML/script content by construction.
function plainUrlLine(url: string): string {
  return url;
}

/**
 * Renders a ProspectBrief to markdown. Same content as the plain-text
 * renderer, only the formatting differs — every section maps 1:1 to
 * renderProspectBriefPlainText's sections, in the same order.
 */
export function renderProspectBriefMarkdown(brief: ProspectBrief): string {
  const lines: string[] = [];

  lines.push(`# Prospect brief — ${escapeMarkdown(brief.businessName)}`);
  lines.push(`*Prepared ${escapeMarkdown(brief.preparedDate)}*`);
  lines.push("");

  lines.push("## Business overview");
  lines.push(...brief.businessOverviewLines.map(toMarkdownLine));
  lines.push("");

  lines.push("## Website overview");
  lines.push(...brief.websiteOverviewLines.map(toMarkdownLine));
  lines.push("");

  lines.push("## Google profile summary");
  lines.push(...brief.googleProfileLines.map(toMarkdownLine));
  lines.push("");

  lines.push("## Audit summary");
  lines.push(...brief.auditSummaryLines.map((line) => escapeMarkdown(line)));
  lines.push("");

  lines.push("## Top opportunities");
  if (brief.topOpportunities.length > 0) {
    lines.push(...brief.topOpportunities.map(formatFindingBullet));
  } else if (brief.topOpportunitiesEmptyText) {
    lines.push(escapeMarkdown(brief.topOpportunitiesEmptyText));
  }
  lines.push("");

  lines.push("## Supporting evidence");
  if (brief.supportingEvidence.length > 0) {
    lines.push(...brief.supportingEvidence.map(formatEvidenceBullet));
  } else if (brief.supportingEvidenceEmptyText) {
    lines.push(escapeMarkdown(brief.supportingEvidenceEmptyText));
  }
  lines.push("");

  lines.push("## Items to verify manually");
  if (brief.itemsToVerify.length > 0) {
    lines.push(...brief.itemsToVerify.map(formatFindingBullet));
  } else if (brief.itemsToVerifyEmptyText) {
    lines.push(escapeMarkdown(brief.itemsToVerifyEmptyText));
  }
  lines.push("");

  lines.push("## Screenshot availability");
  lines.push(escapeMarkdown(brief.screenshotAvailabilityLine));
  lines.push("");

  lines.push("## Suggested email subjects");
  lines.push(...brief.emailSubjects.map((subject) => `1. ${escapeMarkdown(subject)}`));
  lines.push("");

  lines.push("## Suggested opener");
  lines.push(escapeMarkdown(brief.opener));
  lines.push("");

  lines.push("## Suggested body outline");
  lines.push(...brief.bodyOutline.map((item) => `1. ${escapeMarkdown(item)}`));
  lines.push("");

  lines.push("## Suggested Loom / video outline");
  lines.push(...brief.loomOutline.map((item) => `1. ${escapeMarkdown(item)}`));

  return lines.join("\n");
}

// A line that's a bare URL is left unescaped (see plainUrlLine); every
// other overview line is business/finding-derived text and escaped.
function toMarkdownLine(line: string): string {
  return /^https?:\/\//i.test(line) ? plainUrlLine(line) : `- ${escapeMarkdown(line)}`;
}

function formatFindingBullet(finding: ProspectBriefFinding): string {
  return `- ${escapeMarkdown(finding.primaryText)} (${finding.confidenceLabel})`;
}

function formatEvidenceBullet(finding: ProspectBriefFinding): string {
  return `- ${escapeMarkdown(finding.primaryText)}: *"${escapeMarkdown(finding.evidence ?? "")}"* (${finding.confidenceLabel})`;
}
