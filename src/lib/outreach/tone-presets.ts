/**
 * Fixed, deterministic tone presets for the Phase 10 outreach brief.
 * Every string here was drafted and explicitly approved word-for-word
 * before implementation (see CLAUDE.md). No AI generation is involved
 * anywhere in this module or its callers.
 *
 * Tone changes connective language, sentence length, opener structure,
 * subject-line framing, and outline wording ONLY. It never changes
 * facts, confidence, selected findings, evidence, score, audit status,
 * or degree of certainty — those are supplied by the caller and simply
 * substituted into these templates unchanged.
 */

export type ToneId = "warm" | "direct" | "professional";

export interface TonePreset {
  id: ToneId;
  label: string;
  emailSubjects: [string, string, string];
  /**
   * Opener is assembled from three parts so the middle clause can vary
   * by whether any Top-Opportunities-eligible findings were selected,
   * without embedding actual finding text into a fragile hand-tuned
   * sentence (see CLAUDE.md).
   */
  openerIntro: string;
  openerFindingsClause: string;
  openerZeroFindingsClause: string;
  openerClosing: string;
  bodyOutline: [string, string, string, string];
}

export const TONE_PRESETS: Record<ToneId, TonePreset> = {
  warm: {
    id: "warm",
    label: "Warm and consultative",
    emailSubjects: [
      "A few thoughts on {businessName}'s website",
      "Quick website notes for {businessName}",
      "Some ideas for {businessName}, if you're open to them",
    ],
    openerIntro: "Hi there — I recently spent some time reviewing {businessName}'s website.",
    openerFindingsClause: "I noticed {findingCount} specific items that may be worth reviewing together.",
    openerZeroFindingsClause: "I've included the general review notes below for reference.",
    openerClosing: "I'd be glad to walk through what I found whenever it's convenient for you.",
    bodyOutline: [
      "Open with a friendly note about why you're reaching out.",
      "Walk through the opportunities listed above in your own words.",
      "Call out any items that still need manual confirmation, when applicable.",
      "Close by offering a short call or a time to chat — no pressure.",
    ],
  },
  direct: {
    id: "direct",
    label: "Direct and concise",
    emailSubjects: [
      "{businessName} — website review notes",
      "Website review findings for {businessName}",
      "A quick look at {businessName}'s site",
    ],
    openerIntro: "I reviewed {businessName}'s website.",
    openerFindingsClause: "I found {findingCount} specific items worth reviewing.",
    openerZeroFindingsClause: "The general review notes are included below.",
    openerClosing: "Details are below.",
    bodyOutline: [
      "State the purpose of the email in the first line.",
      "List the top opportunities plainly.",
      "Note which items still need manual confirmation.",
      "Ask directly for a short call.",
    ],
  },
  professional: {
    id: "professional",
    label: "Professional and analytical",
    emailSubjects: [
      "Website review findings for {businessName}",
      "Review summary: {businessName}",
      "Observations from a website review of {businessName}",
    ],
    openerIntro: "Our review of {businessName}'s website produced the observations below.",
    openerFindingsClause: "{findingCount} selected, evidence-based observations are outlined below.",
    openerZeroFindingsClause:
      "No specific opportunities are currently selected for this brief; the available review context is outlined below.",
    openerClosing: "Each included item is presented with its supporting detail and confidence level.",
    bodyOutline: [
      "Introduce the review and its scope.",
      "Present the top opportunities with supporting evidence.",
      "Identify items that require manual verification before further discussion.",
      "Propose a follow-up conversation to review findings in detail.",
    ],
  },
};

/** Fixed — not tone-varied, per approval. */
export const LOOM_OUTLINE: [string, string, string, string] = [
  "Start by showing the homepage as the visitor would see it.",
  "Walk through one or two of the top opportunities on screen.",
  "Show the relevant screenshot(s) if available.",
  "Close by summarizing what was reviewed and offering an appropriate next step.",
];

/** Shared, non-tone-specific wording. Every string here was approved verbatim. */
export const SHARED_WORDING = {
  emptyTopOpportunities: "No specific opportunities were selected for this brief.",
  emptySupportingEvidence: "No supporting evidence was selected for this brief.",
  emptyItemsToVerify: "No manual-review items were selected for this brief.",
  partialAudit:
    "This audit completed partially. Some checks could not be completed, so the findings below reflect only the checks that succeeded.",
  failedAudit: "This audit did not complete successfully; no automated findings are available.",
  unreachableWebsite: "The website could not be reached during the recorded audit attempt.",
  googleDataUnavailable: "Google profile data was not imported for this business.",
  noMatchingSignal: "No matching signal was detected in the homepage HTML reviewed.",
  scoreCaveat:
    "This internal score reflects the automated website signals reviewed and is not a complete evaluation of the business.",
  screenshotsBoth:
    "Mobile and desktop homepage screenshots are available for this lead. Review them in the app and attach them manually if you'd like to include them in your outreach.",
  screenshotsMobileOnly:
    "A mobile homepage screenshot is available for this lead. Review it in the app and attach it manually if you'd like to include it in your outreach.",
  screenshotsDesktopOnly:
    "A desktop homepage screenshot is available for this lead. Review it in the app and attach it manually if you'd like to include it in your outreach.",
  screenshotsNone: "No homepage screenshots have been captured for this lead.",
} as const;
