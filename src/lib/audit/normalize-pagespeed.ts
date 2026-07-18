export interface NormalizedPageSpeed {
  performanceScore: number | null;
  accessibilityScore: number | null;
  seoScore: number | null;
  bestPracticesScore: number | null;
  firstContentfulPaintMs: number | null;
  firstContentfulPaintDisplay: string | null;
  largestContentfulPaintMs: number | null;
  largestContentfulPaintDisplay: string | null;
  cumulativeLayoutShift: number | null;
  cumulativeLayoutShiftDisplay: string | null;
  totalBlockingTimeMs: number | null;
  totalBlockingTimeDisplay: string | null;
  speedIndexMs: number | null;
  speedIndexDisplay: string | null;
  fetchedAt: string;
}

interface RawAuditEntry {
  numericValue?: unknown;
  displayValue?: unknown;
}

interface RawCategoryEntry {
  score?: unknown;
}

interface RawLighthouseResult {
  categories?: {
    performance?: RawCategoryEntry;
    accessibility?: RawCategoryEntry;
    seo?: RawCategoryEntry;
    "best-practices"?: RawCategoryEntry;
  };
  audits?: Record<string, RawAuditEntry | undefined>;
}

interface RawPageSpeedResponse {
  lighthouseResult?: RawLighthouseResult;
}

function toScore(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? Math.round(value * 100) : null;
}

function numericValue(entry: RawAuditEntry | undefined): number | null {
  return typeof entry?.numericValue === "number" && !Number.isNaN(entry.numericValue)
    ? entry.numericValue
    : null;
}

function displayValue(entry: RawAuditEntry | undefined): string | null {
  return typeof entry?.displayValue === "string" ? entry.displayValue : null;
}

/**
 * Parses the raw PageSpeed Insights JSON response into a flat,
 * normalized shape. Every field is independently null-safe — a
 * missing or reshaped upstream field degrades to null rather than
 * throwing, since this runs against a live third-party API response.
 */
export function normalizePageSpeedResponse(raw: unknown): NormalizedPageSpeed {
  const result = (raw as RawPageSpeedResponse | undefined)?.lighthouseResult;
  const categories = result?.categories;
  const audits = result?.audits;

  return {
    performanceScore: toScore(categories?.performance?.score),
    accessibilityScore: toScore(categories?.accessibility?.score),
    seoScore: toScore(categories?.seo?.score),
    bestPracticesScore: toScore(categories?.["best-practices"]?.score),
    firstContentfulPaintMs: numericValue(audits?.["first-contentful-paint"]),
    firstContentfulPaintDisplay: displayValue(audits?.["first-contentful-paint"]),
    largestContentfulPaintMs: numericValue(audits?.["largest-contentful-paint"]),
    largestContentfulPaintDisplay: displayValue(audits?.["largest-contentful-paint"]),
    cumulativeLayoutShift: numericValue(audits?.["cumulative-layout-shift"]),
    cumulativeLayoutShiftDisplay: displayValue(audits?.["cumulative-layout-shift"]),
    totalBlockingTimeMs: numericValue(audits?.["total-blocking-time"]),
    totalBlockingTimeDisplay: displayValue(audits?.["total-blocking-time"]),
    speedIndexMs: numericValue(audits?.["speed-index"]),
    speedIndexDisplay: displayValue(audits?.["speed-index"]),
    fetchedAt: new Date().toISOString(),
  };
}
