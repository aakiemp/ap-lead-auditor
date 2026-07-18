import type { GeneratedFinding } from "@/lib/audit/generate-findings";
import type { HomepageScanResult } from "@/lib/audit/scan-homepage";
import type { SitemapRobotsResult } from "@/lib/audit/sitemap-robots";

const MISSING_TITLE_POINTS = 5;
const MISSING_META_DESCRIPTION_POINTS = 5;
const MISSING_H1_POINTS = 5;
const MULTIPLE_H1_POINTS = 2;
const NO_CTA_POINTS = 15;
const NO_PHONE_LINK_POINTS = 10;
const NO_CONTACT_FORM_POINTS = 15;
const FORM_TOO_MANY_FIELDS_POINTS = 5;
const NO_TESTIMONIALS_POINTS = 5;
const NO_TRUST_SIGNALS_POINTS = 5;
const COPYRIGHT_STALE_POINTS = 3;
const NO_LOCAL_BUSINESS_SCHEMA_POINTS = 3;
const NO_PRIVACY_POLICY_POINTS = 3;
const NO_SITEMAP_POINTS = 2;

const FORM_FIELD_LIMIT = 10;
const COPYRIGHT_STALE_YEARS = 3;

/**
 * Converts a successful homepage scan into findings. Only ever called
 * when `scan.ok === true` — callers must not invoke this for a failed
 * scan (that's what the single "homepage content could not be fully
 * reviewed" manual-review finding in run-audit.ts is for instead).
 * Pure function — no I/O.
 *
 * Presence findings are stored with 0 points (useful outreach
 * evidence). Absence findings score per the approved Phase 7 rules —
 * every one only fires here, i.e. only when the detector that
 * produced it actually completed.
 */
export function generateHtmlFindings(scan: HomepageScanResult, currentYear: number): GeneratedFinding[] {
  if (!scan.ok) return [];

  const findings: GeneratedFinding[] = [];

  if (!scan.homepageTitle) {
    findings.push({
      category: "seo",
      findingType: "missing_title",
      title: "Missing page title",
      description: "No <title> element was detected in the homepage HTML reviewed.",
      evidence: null,
      sourceType: "html_scan",
      severity: "medium",
      confidence: "verified",
      points: MISSING_TITLE_POINTS,
      ruleId: "missing_title",
    });
  }

  if (!scan.metaDescription) {
    findings.push({
      category: "seo",
      findingType: "missing_meta_description",
      title: "Missing meta description",
      description: "No meta description tag was detected in the homepage HTML reviewed.",
      evidence: null,
      sourceType: "html_scan",
      severity: "medium",
      confidence: "verified",
      points: MISSING_META_DESCRIPTION_POINTS,
      ruleId: "missing_meta_description",
    });
  }

  if (scan.h1Count === 0) {
    findings.push({
      category: "seo",
      findingType: "missing_h1",
      title: "Missing H1 heading",
      description: "No H1 element was detected in the homepage HTML reviewed.",
      evidence: null,
      sourceType: "html_scan",
      severity: "medium",
      confidence: "verified",
      points: MISSING_H1_POINTS,
      ruleId: "missing_h1",
    });
  } else if (scan.h1Count > 1) {
    findings.push({
      category: "seo",
      findingType: "multiple_h1",
      title: "Multiple H1 headings",
      description: `${scan.h1Count} H1 elements were detected in the homepage HTML reviewed.`,
      evidence: String(scan.h1Count),
      sourceType: "html_scan",
      severity: "low",
      confidence: "verified",
      points: MULTIPLE_H1_POINTS,
      ruleId: "multiple_h1",
    });
  }

  if (scan.ctaCandidates.length > 0) {
    const unique = Array.from(new Set(scan.ctaCandidates.map((c) => c.phrase)));
    findings.push({
      category: "conversion",
      findingType: "cta_detected",
      title: "Call-to-action detected",
      description: `A link or button matching common call-to-action phrasing was found on the homepage (matched: ${unique.join(", ")}).`,
      evidence: unique.join(", "),
      sourceType: "html_scan",
      severity: "info",
      confidence: "verified",
      points: 0,
      ruleId: "cta_detected",
    });
  } else {
    findings.push({
      category: "conversion",
      findingType: "no_cta_detected",
      title: "No common call-to-action phrase detected",
      description:
        "No link or button matching common call-to-action phrasing (e.g. Contact Us, Get a Quote, Schedule) was found on the homepage.",
      evidence: null,
      sourceType: "html_scan",
      severity: "high",
      confidence: "verified",
      points: NO_CTA_POINTS,
      ruleId: "no_cta_detected",
    });
  }

  findings.push(
    scan.contactPageLinkDetected
      ? {
          category: "contact",
          findingType: "contact_page_link_detected",
          title: "Contact page link detected",
          description: "A link referencing a contact page was found on the homepage.",
          evidence: null,
          sourceType: "html_scan",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "contact_page_link_detected",
        }
      : {
          category: "contact",
          findingType: "contact_page_link_not_detected",
          title: "Contact page link not detected",
          description: "No link referencing a contact page was found in the homepage HTML reviewed.",
          evidence: null,
          sourceType: "html_scan",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "contact_page_link_not_detected",
        },
  );

  if (scan.phoneLinkDetected) {
    findings.push({
      category: "contact",
      findingType: "phone_link_detected",
      title: "Clickable phone link detected",
      description: "A telephone link (tel:) was found on the homepage.",
      evidence: null,
      sourceType: "html_scan",
      severity: "info",
      confidence: "verified",
      points: 0,
      ruleId: "phone_link_detected",
    });
  } else {
    findings.push({
      category: "contact",
      findingType: "no_phone_link_detected",
      title: "No clickable phone link detected",
      description: "No telephone link (tel:) was found in the homepage HTML reviewed.",
      evidence: null,
      sourceType: "html_scan",
      severity: "high",
      confidence: "verified",
      points: NO_PHONE_LINK_POINTS,
      ruleId: "no_phone_link_detected",
    });
  }

  findings.push(
    scan.emailLinkDetected
      ? {
          category: "contact",
          findingType: "email_link_detected",
          title: "Clickable email link detected",
          description: "A mailto link was found on the homepage.",
          evidence: null,
          sourceType: "html_scan",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "email_link_detected",
        }
      : {
          category: "contact",
          findingType: "no_email_link_detected",
          title: "No clickable email link detected",
          description: "No mailto link was detected in the homepage HTML reviewed.",
          evidence: null,
          sourceType: "html_scan",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "no_email_link_detected",
        },
  );

  if (scan.contactForm.detected) {
    const parts = [
      `${scan.contactForm.fieldCount} field${scan.contactForm.fieldCount === 1 ? "" : "s"}`,
      `${scan.contactForm.requiredFieldCount} required`,
    ];
    if (scan.contactForm.submitText) parts.push(`submit button labeled "${scan.contactForm.submitText}"`);
    findings.push({
      category: "contact",
      findingType: "contact_form_detected",
      title: "Contact form detected",
      description: `A form was found on the homepage (${parts.join(", ")}).`,
      evidence: scan.contactForm.provider ? `Provider: ${scan.contactForm.provider}` : null,
      sourceType: "html_scan",
      severity: "info",
      confidence: scan.contactForm.provider ? "likely" : "verified",
      points: 0,
      ruleId: "contact_form_detected",
    });

    if (scan.contactForm.fieldCount > FORM_FIELD_LIMIT) {
      findings.push({
        category: "conversion",
        findingType: "form_too_many_fields",
        title: "Contact form has more than 10 fields",
        description: `The homepage contact form has ${scan.contactForm.fieldCount} fields.`,
        evidence: String(scan.contactForm.fieldCount),
        sourceType: "html_scan",
        severity: "medium",
        confidence: "verified",
        points: FORM_TOO_MANY_FIELDS_POINTS,
        ruleId: "form_too_many_fields",
      });
    }
  } else {
    findings.push({
      category: "contact",
      findingType: "no_contact_form_detected",
      title: "No contact form detected",
      description: "No form element was found in the homepage HTML reviewed.",
      evidence: null,
      sourceType: "html_scan",
      severity: "high",
      confidence: "verified",
      points: NO_CONTACT_FORM_POINTS,
      ruleId: "no_contact_form_detected",
    });
  }

  if (scan.testimonialsDetected) {
    findings.push({
      category: "trust",
      findingType: "testimonials_detected",
      title: "Testimonials or reviews section detected",
      description: "Text suggesting a testimonials or reviews section was found on the homepage.",
      evidence: null,
      sourceType: "html_scan",
      severity: "info",
      confidence: "likely",
      points: 0,
      ruleId: "testimonials_detected",
    });
  } else {
    findings.push({
      category: "trust",
      findingType: "no_testimonials_detected",
      title: "No testimonial or review signal detected",
      description: "No testimonials or reviews section was detected in the homepage HTML reviewed.",
      evidence: null,
      sourceType: "html_scan",
      severity: "medium",
      confidence: "likely",
      points: NO_TESTIMONIALS_POINTS,
      ruleId: "no_testimonials_detected",
    });
  }

  if (scan.trustSignals.length > 0) {
    for (const signal of scan.trustSignals) {
      const label = humanizeTrustType(signal.type);
      findings.push({
        category: "trust",
        findingType: `trust_signal_${signal.type}`,
        title: `Trust signal detected: ${label}`,
        description: `Text suggesting "${label}" was found on the homepage.`,
        evidence: signal.snippet,
        sourceType: "html_scan",
        severity: "info",
        confidence: "likely",
        points: 0,
        ruleId: `trust_signal_${signal.type}`,
      });
    }
  } else {
    findings.push({
      category: "trust",
      findingType: "no_trust_signals_detected",
      title: "No trust signals detected",
      description:
        "No trust-signal keywords (e.g. licensed, insured, warranty, years in business) were detected in the homepage HTML reviewed.",
      evidence: null,
      sourceType: "html_scan",
      severity: "medium",
      confidence: "likely",
      points: NO_TRUST_SIGNALS_POINTS,
      ruleId: "no_trust_signals_detected",
    });
  }

  if (scan.socialLinks.length > 0) {
    findings.push({
      category: "trust",
      findingType: "social_links_detected",
      title: "Social media links detected",
      description: `Links to the following social platforms were found: ${scan.socialLinks.join(", ")}.`,
      evidence: scan.socialLinks.join(", "),
      sourceType: "html_scan",
      severity: "info",
      confidence: "verified",
      points: 0,
      ruleId: "social_links_detected",
    });
  }

  if (scan.copyrightYear !== null) {
    const isStale = currentYear - scan.copyrightYear >= COPYRIGHT_STALE_YEARS;
    findings.push({
      category: "freshness",
      findingType: isStale ? "copyright_year_stale" : "copyright_year_detected",
      title: "Footer copyright year detected",
      description: `Footer copyright year detected as ${scan.copyrightYear}. This is a freshness signal, not a conclusion about when the website was last updated.`,
      evidence: String(scan.copyrightYear),
      sourceType: "html_scan",
      severity: isStale ? "low" : "info",
      confidence: "verified",
      points: isStale ? COPYRIGHT_STALE_POINTS : 0,
      ruleId: isStale ? "copyright_year_stale" : "copyright_year_detected",
    });
  }

  for (const tech of scan.technologies) {
    const slug = tech.name.toLowerCase().replace(/\s+/g, "_");
    findings.push({
      category: "technology",
      findingType: `technology_${slug}`,
      title: `Technology detected: ${tech.name}`,
      description: `Signals consistent with ${tech.name} were detected on the homepage.`,
      evidence: null,
      sourceType: "html_scan",
      severity: "info",
      confidence: "likely",
      points: 0,
      ruleId: `technology_${slug}`,
    });
  }

  findings.push(
    scan.localBusinessSchemaDetected
      ? {
          category: "local_consistency",
          findingType: "local_business_schema_detected",
          title: "LocalBusiness structured data detected",
          description:
            "Structured data (JSON-LD) matching LocalBusiness or a recognized subtype was found on the homepage.",
          evidence: null,
          sourceType: "html_scan",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "local_business_schema_detected",
        }
      : {
          category: "local_consistency",
          findingType: "no_local_business_schema_detected",
          title: "No LocalBusiness structured data detected",
          description:
            "No structured data (JSON-LD) matching LocalBusiness or a recognized subtype was found in the homepage HTML reviewed.",
          evidence: null,
          sourceType: "html_scan",
          severity: "low",
          confidence: "verified",
          points: NO_LOCAL_BUSINESS_SCHEMA_POINTS,
          ruleId: "no_local_business_schema_detected",
        },
  );

  findings.push(
    scan.privacyPolicyLinkDetected
      ? {
          category: "trust",
          findingType: "privacy_policy_link_detected",
          title: "Privacy policy link detected",
          description: "A link referencing a privacy policy was found on the homepage.",
          evidence: null,
          sourceType: "html_scan",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "privacy_policy_link_detected",
        }
      : {
          category: "trust",
          findingType: "no_privacy_policy_link_detected",
          title: "No privacy-policy link detected",
          description: "No link referencing a privacy policy was found in the homepage HTML reviewed.",
          evidence: null,
          sourceType: "html_scan",
          severity: "low",
          confidence: "verified",
          points: NO_PRIVACY_POLICY_POINTS,
          ruleId: "no_privacy_policy_link_detected",
        },
  );

  findings.push(
    scan.termsLinkDetected
      ? {
          category: "trust",
          findingType: "terms_link_detected",
          title: "Terms link detected",
          description: "A link referencing terms of service/use was found on the homepage.",
          evidence: null,
          sourceType: "html_scan",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "terms_link_detected",
        }
      : {
          category: "trust",
          findingType: "no_terms_link_detected",
          title: "No terms link detected",
          description: "No link referencing terms of service/use was found in the homepage HTML reviewed.",
          evidence: null,
          sourceType: "html_scan",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "no_terms_link_detected",
        },
  );

  return findings;
}

/**
 * Converts the independent sitemap.xml/robots.txt check into
 * findings. Callable whenever that check itself completed, regardless
 * of whether the homepage scan succeeded — the two are unrelated
 * resources. Pure function — no I/O.
 */
export function generateSitemapRobotsFindings(result: SitemapRobotsResult): GeneratedFinding[] {
  const findings: GeneratedFinding[] = [];

  findings.push(
    result.sitemapDetected
      ? {
          category: "seo",
          findingType: "sitemap_detected",
          title: "Sitemap detected",
          description: "A sitemap.xml file was found for this website.",
          evidence: null,
          sourceType: "sitemap_check",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "sitemap_detected",
        }
      : {
          category: "seo",
          findingType: "no_sitemap_detected",
          title: "No sitemap detected",
          description: "No sitemap.xml file was found at the expected location for this website.",
          evidence: null,
          sourceType: "sitemap_check",
          severity: "low",
          confidence: "verified",
          points: NO_SITEMAP_POINTS,
          ruleId: "no_sitemap_detected",
        },
  );

  findings.push(
    result.robotsTxtDetected
      ? {
          category: "technical",
          findingType: "robots_txt_detected",
          title: "robots.txt detected",
          description: "A robots.txt file was found for this website.",
          evidence: null,
          sourceType: "sitemap_check",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "robots_txt_detected",
        }
      : {
          category: "technical",
          findingType: "no_robots_txt_detected",
          title: "robots.txt not detected",
          description: "No robots.txt file was found at the expected location for this website.",
          evidence: null,
          sourceType: "sitemap_check",
          severity: "info",
          confidence: "verified",
          points: 0,
          ruleId: "no_robots_txt_detected",
        },
  );

  return findings;
}

function humanizeTrustType(type: string): string {
  return type.replace(/_/g, " ");
}
