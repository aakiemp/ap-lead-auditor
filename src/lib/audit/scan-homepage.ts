import "server-only";

import * as cheerio from "cheerio";

import { fetchHomepageHtml, HtmlFetchError, SsrfBlockedError } from "@/lib/audit/fetch-html";

export { SsrfBlockedError };

/**
 * Fixed phrase list for primary call-to-action detection. Matching is
 * scoped to exactly this list — findings describing an absence are
 * worded to reflect that ("no link or button matching common
 * call-to-action phrasing"), never an unqualified "no CTA exists."
 */
const CTA_PHRASES = [
  "Contact Us",
  "Contact",
  "Call Now",
  "Get Started",
  "Request a Quote",
  "Get a Quote",
  "Schedule",
  "Book Now",
  "Book Online",
  "Make an Appointment",
  "Free Estimate",
  "Request Service",
  "Learn More",
  "Shop Now",
  "Order Now",
  "Apply Now",
];

const CTA_TEXT_MAX_LENGTH = 50;

const SOCIAL_DOMAINS: Record<string, string> = {
  "facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "twitter.com": "X (Twitter)",
  "x.com": "X (Twitter)",
  "linkedin.com": "LinkedIn",
  "youtube.com": "YouTube",
  "tiktok.com": "TikTok",
  "pinterest.com": "Pinterest",
  "yelp.com": "Yelp",
};

const TRUST_SIGNAL_PATTERNS: { type: string; pattern: RegExp }[] = [
  { type: "licensed", pattern: /\blicensed\b/i },
  { type: "insured", pattern: /\binsured\b/i },
  { type: "bonded", pattern: /\bbonded\b/i },
  { type: "bbb", pattern: /\bbbb\b|better business bureau/i },
  {
    type: "years_in_business",
    pattern:
      /\b(?:since|est\.?|established)\s*(?:19|20)\d{2}\b|\b\d+\+?\s*years?\s+(?:of\s+)?experience\b|\byears?\s+in\s+business\b/i,
  },
  { type: "satisfaction_guarantee", pattern: /satisfaction\s+guarantee/i },
  { type: "warranty", pattern: /\bwarrant(?:y|ies)\b/i },
  { type: "financing", pattern: /\bfinancing\b|\bfinance\s+options?\b/i },
  { type: "award", pattern: /\baward[- ]winning\b|\bawards?\b/i },
  { type: "certified", pattern: /\bcertifi(?:ed|cation)\b/i },
  { type: "case_studies", pattern: /\bcase\s+stud(?:y|ies)\b/i },
  { type: "portfolio", pattern: /\bportfolio\b/i },
  { type: "team", pattern: /\bmeet\s+the\s+team\b|\bour\s+team\b/i },
  { type: "about_us", pattern: /\babout\s+us\b/i },
];

const TESTIMONIAL_PATTERN =
  /\btestimonial|what (?:our )?(?:clients?|customers?) (?:are )?sa(?:y|ying)|client feedback|customer reviews?\b/i;

const TECHNOLOGY_SIGNATURES: { name: string; test: (html: string) => boolean }[] = [
  { name: "WordPress", test: (html) => /wp-content|wp-includes/i.test(html) },
  { name: "Divi", test: (html) => /\bet_pb_|divi-style/i.test(html) },
  { name: "Elementor", test: (html) => /elementor/i.test(html) },
  { name: "WooCommerce", test: (html) => /woocommerce/i.test(html) },
  { name: "Wix", test: (html) => /static\.wixstatic\.com|wix\.com/i.test(html) },
  { name: "Squarespace", test: (html) => /squarespace\.com|static1\.squarespace/i.test(html) },
  { name: "Webflow", test: (html) => /webflow\.(?:com|io)/i.test(html) },
  { name: "Shopify", test: (html) => /cdn\.shopify\.com/i.test(html) },
  { name: "HubSpot", test: (html) => /hs-scripts\.com|hsforms\.net|hubspot/i.test(html) },
  { name: "Google Analytics", test: (html) => /gtag\(.*['"]G-|google-analytics\.com\/analytics\.js/i.test(html) },
  { name: "Google Tag Manager", test: (html) => /googletagmanager\.com\/gtm\.js/i.test(html) },
  { name: "Meta Pixel", test: (html) => /connect\.facebook\.net.*fbevents\.js/i.test(html) },
  { name: "Calendly", test: (html) => /calendly\.com/i.test(html) },
  { name: "jQuery", test: (html) => /jquery(?:-[\d.]+)?\.min\.js|jquery\.js/i.test(html) },
  { name: "Cloudflare", test: (html) => /cdnjs\.cloudflare\.com|cloudflareinsights\.com/i.test(html) },
];

const FORM_PROVIDER_SIGNATURES: { name: string; test: (formHtml: string, pageHtml: string) => boolean }[] = [
  { name: "Contact Form 7", test: (formHtml) => /wpcf7/i.test(formHtml) },
  { name: "Gravity Forms", test: (formHtml) => /gform_/i.test(formHtml) },
  { name: "WPForms", test: (formHtml) => /wpforms/i.test(formHtml) },
  {
    name: "HubSpot Forms",
    test: (formHtml, pageHtml) => /hs-form|hsforms\.net/i.test(formHtml + pageHtml),
  },
  { name: "Jotform", test: (formHtml) => /jotform/i.test(formHtml) },
  { name: "Typeform", test: (formHtml) => /typeform\.com/i.test(formHtml) },
];

const LOCAL_BUSINESS_TYPES = new Set([
  "localbusiness",
  "homeandconstructionbusiness",
  "roofingcontractor",
  "hvacbusiness",
  "plumber",
  "electrician",
  "generalcontractor",
  "housepainter",
  "movingcompany",
  "dentist",
  "physician",
  "medicalbusiness",
  "restaurant",
  "store",
  "autorepair",
  "legalservice",
  "professionalservice",
]);

export interface CtaCandidate {
  phrase: string;
  text: string;
  href: string | null;
  elementType: "a" | "button";
  inHeader: boolean;
}

export interface ContactFormInfo {
  detected: boolean;
  provider: string | null;
  fieldCount: number;
  requiredFieldCount: number;
  submitText: string | null;
}

export interface DetectedTrustSignal {
  type: string;
  snippet: string;
}

export interface DetectedTechnology {
  name: string;
}

export interface HomepageScanResult {
  ok: boolean;
  failureReason: string | null;
  homepageTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  h1Text: string | null;
  h1Count: number;
  ctaCandidates: CtaCandidate[];
  contactPageLinkDetected: boolean;
  phoneLinkDetected: boolean;
  emailLinkDetected: boolean;
  contactForm: ContactFormInfo;
  testimonialsDetected: boolean;
  trustSignals: DetectedTrustSignal[];
  socialLinks: string[];
  copyrightYear: number | null;
  technologies: DetectedTechnology[];
  localBusinessSchemaDetected: boolean;
  privacyPolicyLinkDetected: boolean;
  termsLinkDetected: boolean;
}

function failedScan(reason: string): HomepageScanResult {
  return {
    ok: false,
    failureReason: reason,
    homepageTitle: null,
    metaDescription: null,
    canonicalUrl: null,
    robotsMeta: null,
    h1Text: null,
    h1Count: 0,
    ctaCandidates: [],
    contactPageLinkDetected: false,
    phoneLinkDetected: false,
    emailLinkDetected: false,
    contactForm: { detected: false, provider: null, fieldCount: 0, requiredFieldCount: 0, submitText: null },
    testimonialsDetected: false,
    trustSignals: [],
    socialLinks: [],
    copyrightYear: null,
    technologies: [],
    localBusinessSchemaDetected: false,
    privacyPolicyLinkDetected: false,
    termsLinkDetected: false,
  };
}

function truncate(text: string, max = 200): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * Fetches and scans a website's homepage. Never throws — every
 * failure mode (SSRF block, network/timeout, non-HTML content type,
 * oversized response, unparseable HTML) degrades to a
 * `{ ok: false, failureReason }` result. The raw HTML is parsed in
 * memory here and discarded; nothing beyond the extracted structured
 * fields and short evidence snippets below is ever persisted.
 *
 * No page scripts are ever executed (cheerio is a static HTML parser,
 * not a browser) and no forms are ever submitted — this only reads
 * DOM structure.
 */
export async function scanHomepage(url: URL): Promise<HomepageScanResult> {
  let html: string;
  try {
    const fetched = await fetchHomepageHtml(url);
    html = fetched.html;
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    const reason = err instanceof HtmlFetchError ? err.reason : "unexpected_error";
    return failedScan(reason);
  }

  try {
    return parseHomepage(html);
  } catch {
    return failedScan("parse_error");
  }
}

function parseHomepage(html: string): HomepageScanResult {
  const $ = cheerio.load(html);

  // Strip non-visible/non-content elements before any text-based
  // keyword detection, so CSS/JS/template source never gets
  // mistaken for visible page content.
  const $text = cheerio.load(html);
  $text("script, style, noscript, template").remove();
  const bodyText = $text("body").text();

  const homepageTitle = $("title").first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  const canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim() || null;
  const robotsMeta = $('meta[name="robots"]').attr("content")?.trim() || null;

  const h1Elements = $("h1");
  const h1Count = h1Elements.length;
  const h1Text = h1Count > 0 ? truncate(h1Elements.first().text()) : null;

  const ctaCandidates = detectCtaCandidates($);

  const linkSignals = detectLinkSignals($);

  const contactForm = detectContactForm($, html);
  const testimonialsDetected = TESTIMONIAL_PATTERN.test(bodyText);
  const trustSignals = detectTrustSignals(bodyText);
  const copyrightYear = detectCopyrightYear(bodyText);
  const technologies = detectTechnologies(html);
  const localBusinessSchemaDetected = detectLocalBusinessSchema($);

  return {
    ok: true,
    failureReason: null,
    homepageTitle,
    metaDescription,
    canonicalUrl,
    robotsMeta,
    h1Text,
    h1Count,
    ctaCandidates,
    contactPageLinkDetected: linkSignals.contactPageLinkDetected,
    phoneLinkDetected: linkSignals.phoneLinkDetected,
    emailLinkDetected: linkSignals.emailLinkDetected,
    contactForm,
    testimonialsDetected,
    trustSignals,
    socialLinks: linkSignals.socialLinks,
    copyrightYear,
    technologies,
    localBusinessSchemaDetected,
    privacyPolicyLinkDetected: linkSignals.privacyPolicyLinkDetected,
    termsLinkDetected: linkSignals.termsLinkDetected,
  };
}

function detectCtaCandidates($: cheerio.CheerioAPI): CtaCandidate[] {
  const candidates: CtaCandidate[] = [];

  $("a, button").each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, " ").trim();
    if (!text || text.length > CTA_TEXT_MAX_LENGTH) return;

    const lowerText = text.toLowerCase();
    const matchedPhrase = CTA_PHRASES.find(
      (phrase) => lowerText === phrase.toLowerCase() || lowerText.includes(phrase.toLowerCase()),
    );
    if (!matchedPhrase) return;

    const inHeader = $el.closest("header, nav").length > 0;
    candidates.push({
      phrase: matchedPhrase,
      text: truncate(text, 60),
      href: el.tagName === "a" ? ($el.attr("href") ?? null) : null,
      elementType: el.tagName === "a" ? "a" : "button",
      inHeader,
    });
  });

  return candidates;
}

interface LinkSignals {
  contactPageLinkDetected: boolean;
  phoneLinkDetected: boolean;
  emailLinkDetected: boolean;
  privacyPolicyLinkDetected: boolean;
  termsLinkDetected: boolean;
  socialLinks: string[];
}

function detectLinkSignals($: cheerio.CheerioAPI): LinkSignals {
  let contactPageLinkDetected = false;
  let phoneLinkDetected = false;
  let emailLinkDetected = false;
  let privacyPolicyLinkDetected = false;
  let termsLinkDetected = false;
  const socialLinksSet = new Map<string, string>();

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    const hrefLower = href.toLowerCase();
    const text = $(el).text().toLowerCase();

    if (hrefLower.startsWith("tel:")) phoneLinkDetected = true;
    if (hrefLower.startsWith("mailto:")) emailLinkDetected = true;
    if (hrefLower.includes("contact") || text.includes("contact")) contactPageLinkDetected = true;
    if (hrefLower.includes("privacy") || text.includes("privacy")) privacyPolicyLinkDetected = true;
    if (hrefLower.includes("terms") || text.includes("terms")) termsLinkDetected = true;

    for (const [domain, name] of Object.entries(SOCIAL_DOMAINS)) {
      if (hrefLower.includes(domain)) socialLinksSet.set(domain, name);
    }
  });

  return {
    contactPageLinkDetected,
    phoneLinkDetected,
    emailLinkDetected,
    privacyPolicyLinkDetected,
    termsLinkDetected,
    socialLinks: Array.from(socialLinksSet.values()),
  };
}

function detectContactForm($: cheerio.CheerioAPI, html: string): ContactFormInfo {
  const forms = $("form");
  if (forms.length === 0) {
    return { detected: false, provider: null, fieldCount: 0, requiredFieldCount: 0, submitText: null };
  }

  const $form = forms.first();
  const formHtml = $.html($form) ?? "";

  const fields = $form.find("input, select, textarea").filter((_, el) => {
    const type = ($(el).attr("type") ?? "").toLowerCase();
    return !["hidden", "submit", "button", "image"].includes(type);
  });
  const fieldCount = fields.length;
  const requiredFieldCount = fields.filter(
    (_, el) => $(el).attr("required") !== undefined || $(el).attr("aria-required") === "true",
  ).length;

  const submitEl = $form.find('button[type="submit"], input[type="submit"]').first();
  const submitTextRaw =
    submitEl.length > 0
      ? submitEl.is("input")
        ? (submitEl.attr("value") ?? "")
        : submitEl.text()
      : "";
  const submitText = submitTextRaw ? truncate(submitTextRaw, 60) : null;

  let provider: string | null = null;
  for (const sig of FORM_PROVIDER_SIGNATURES) {
    if (sig.test(formHtml, html)) {
      provider = sig.name;
      break;
    }
  }

  return { detected: true, provider, fieldCount, requiredFieldCount, submitText };
}

function detectTrustSignals(bodyText: string): DetectedTrustSignal[] {
  const signals: DetectedTrustSignal[] = [];
  for (const { type, pattern } of TRUST_SIGNAL_PATTERNS) {
    const match = bodyText.match(pattern);
    if (!match) continue;
    const idx = match.index ?? 0;
    const snippet = truncate(bodyText.slice(Math.max(0, idx - 40), idx + 80));
    signals.push({ type, snippet });
  }
  return signals;
}

function detectCopyrightYear(text: string): number | null {
  const matches = Array.from(
    text.matchAll(/(?:©|copyright)\s*(?:©)?\s*(?:\d{4}\s*[-–—]\s*)?(\d{4})/gi),
  );
  if (matches.length === 0) return null;
  const years = matches.map((m) => Number(m[1])).filter((y) => y >= 1990 && y <= 2100);
  if (years.length === 0) return null;
  return Math.max(...years);
}

function detectTechnologies(html: string): DetectedTechnology[] {
  const technologies: DetectedTechnology[] = [];
  for (const sig of TECHNOLOGY_SIGNATURES) {
    if (sig.test(html)) technologies.push({ name: sig.name });
  }
  return technologies;
}

function detectLocalBusinessSchema($: cheerio.CheerioAPI): boolean {
  let found = false;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    const raw = $(el).contents().text();
    // Malformed JSON-LD must not fail the scan -- skip this block only.
    try {
      const data: unknown = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (matchesLocalBusinessType(item)) {
          found = true;
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  return found;
}

function matchesLocalBusinessType(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const record = item as Record<string, unknown>;

  const types = normalizeLdType(record["@type"]);
  if (types.some((t) => LOCAL_BUSINESS_TYPES.has(t.toLowerCase()))) return true;

  const graph = record["@graph"];
  if (Array.isArray(graph)) {
    return graph.some((sub) => matchesLocalBusinessType(sub));
  }

  return false;
}

function normalizeLdType(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}
