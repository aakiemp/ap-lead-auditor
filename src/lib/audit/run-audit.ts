import "server-only";

import { checkReachability, SsrfBlockedError as ReachabilitySsrfBlockedError } from "@/lib/audit/check-reachability";
import {
  generateReachableFindings,
  generateUnreachableFinding,
  type GeneratedFinding,
} from "@/lib/audit/generate-findings";
import { generateHtmlFindings, generateSitemapRobotsFindings } from "@/lib/audit/generate-html-findings";
import { InvalidUrlError, parseAndNormalizeInputUrl, stripTrackingParams } from "@/lib/audit/normalize-url";
import { normalizePageSpeedResponse, type NormalizedPageSpeed } from "@/lib/audit/normalize-pagespeed";
import { fetchMobilePageSpeed, PageSpeedError } from "@/lib/audit/pagespeed";
import { scanHomepage, SsrfBlockedError, type HomepageScanResult } from "@/lib/audit/scan-homepage";
import { checkSitemapAndRobots, type SitemapRobotsResult } from "@/lib/audit/sitemap-robots";
import { serverEnv } from "@/lib/env";
import { calculateWebsiteNeedScore } from "@/lib/scoring/website-need-score";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type RunAuditResult =
  | { ok: true; auditId: string; status: "completed" | "partial" | "failed" }
  | { ok: false; error: string; alreadyClaimed?: boolean };

const CLAIMED_BY = "manual-ui";

interface AuditJobRow {
  id: string;
  business_id: string;
  website_id: string;
  audit_depth: "discovery_only" | "basic" | "deep";
}

interface HomepageMeta {
  homepageTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  h1Text: string | null;
  h1Count: number | null;
}

function emptyHomepageMeta(): HomepageMeta {
  return {
    homepageTitle: null,
    metaDescription: null,
    canonicalUrl: null,
    robotsMeta: null,
    h1Text: null,
    h1Count: null,
  };
}

/**
 * Processes one existing audit_jobs row: atomically claims it (only
 * from queued/pending). If the website's reachability has never been
 * checked (is_reachable is null — true for every business imported via
 * Google Places discovery, which intentionally defers this check; see
 * CLAUDE.md), runs checkReachability() now and persists the result
 * before proceeding. Skips PageSpeed and the homepage scan entirely for
 * a website that isn't known-reachable, otherwise calls PageSpeed
 * mobile and scans the homepage HTML CONCURRENTLY (independent
 * operations against the same site).
 *
 * Four outcomes depending on which of PageSpeed / the homepage scan
 * succeeded (see CLAUDE.md for the full rationale):
 *   A. both succeed  -> audits.status/job.status = 'completed', all findings, full score
 *   B. PageSpeed only -> 'completed', PageSpeed findings + one manual-review
 *      note that homepage content couldn't be fully reviewed; no
 *      absence-based HTML findings (the scan didn't complete)
 *   C. HTML only      -> 'partial', HTML + website-fact findings + one
 *      note that PageSpeed was unavailable; score from what succeeded
 *   D. neither         -> 'failed', no findings/score at all, sanitized
 *      job error_message
 *
 * A failure after the audits row is created deletes it (cascades clean
 * up any partial children) and marks the job failed — mirrors the
 * Phase 3/4 write pattern rather than a transactional RPC.
 *
 * attempt (Phase 9): incremented by exactly one per actual execution,
 * entirely inside this function's own atomic claim step — a job's
 * first-ever claim leaves attempt at its INSERT default of 1
 * unchanged; every claim after that (i.e. every retry, since
 * retryAuditJob() resets status to queued but never touches attempt
 * itself) increments it by one. Only the claim that actually wins the
 * status-guarded UPDATE ever has its attempt value persisted, so a
 * losing concurrent claim attempt (see alreadyClaimed below) can never
 * cause a double-increment.
 */
export async function runAudit(jobId: string): Promise<RunAuditResult> {
  const supabase = createSupabaseServiceRoleClient();

  // Peek at claimed_at to decide whether this claim is the job's very
  // first execution (claimed_at still null — attempt stays at its
  // INSERT default of 1, unchanged) or a retry-driven re-claim
  // (claimed_at already set from a prior run — attempt increments by
  // one). This keeps the increment entirely inside this single atomic
  // claim step (see CLAUDE.md) rather than splitting it across a
  // separate retry-reset step, so a retry can never double-increment:
  // retryAuditJob() never touches `attempt` itself, only this claim
  // does, and it only runs once per retry click. The peek's read is
  // not itself transactionally tied to the claim UPDATE below, but
  // that's safe here — the UPDATE's own `status IN (...)` guard is
  // the actual correctness mechanism; only the claim that wins the
  // race ever has its `attempt` value written.
  const { data: preClaim } = await supabase
    .from("audit_jobs")
    .select("attempt, claimed_at")
    .eq("id", jobId)
    .maybeSingle();

  const nextAttempt = preClaim
    ? preClaim.claimed_at
      ? preClaim.attempt + 1
      : preClaim.attempt
    : 1;

  const { data: job, error: claimError } = await supabase
    .from("audit_jobs")
    .update({
      status: "auditing",
      claimed_at: new Date().toISOString(),
      claimed_by: CLAIMED_BY,
      attempt: nextAttempt,
    })
    .eq("id", jobId)
    .in("status", ["queued", "pending"])
    .select("*")
    .maybeSingle();

  if (claimError) {
    console.error("[runAudit] failed to claim job:", claimError);
    return { ok: false, error: "Could not start this audit right now. Please try again." };
  }
  if (!job) {
    return {
      ok: false,
      error: "This audit is already running or has already finished.",
      alreadyClaimed: true,
    };
  }

  const { data: fetchedWebsite, error: websiteError } = await supabase
    .from("websites")
    .select("*")
    .eq("id", job.website_id)
    .maybeSingle();

  if (websiteError || !fetchedWebsite) {
    console.error("[runAudit] website lookup failed:", websiteError);
    await supabase
      .from("audit_jobs")
      .update({ status: "failed", error_message: "website_not_found" })
      .eq("id", job.id);
    return { ok: false, error: "Could not find the website record for this audit." };
  }

  let website = fetchedWebsite;

  // A website is only ever null (never true/false) when it was
  // imported via Google Places discovery, which intentionally skips
  // the reachability check at import time (see CLAUDE.md). Run it now,
  // the first time this business's basic audit actually executes, and
  // persist the result before deciding how to proceed — null must not
  // be treated as "confirmed unreachable".
  if (website.is_reachable === null) {
    let startUrl: URL;
    try {
      startUrl = parseAndNormalizeInputUrl(website.input_url).url;
    } catch (err) {
      console.error(
        "[runAudit] stored input_url is not a valid URL:",
        err instanceof InvalidUrlError ? err.message : err,
      );
      await supabase
        .from("audit_jobs")
        .update({ status: "failed", error_message: "invalid_target_url" })
        .eq("id", job.id);
      return { ok: false, error: "This website's URL could not be audited." };
    }

    let reachability;
    try {
      reachability = await checkReachability(startUrl);
    } catch (err) {
      if (err instanceof ReachabilitySsrfBlockedError) {
        reachability = {
          isReachable: false,
          finalUrl: null,
          httpStatus: null,
          httpsEnabled: null,
          redirectCount: 0,
          redirectChain: [] as string[],
          httpToHttpsRedirect: false,
          failureReason: "ssrf_blocked",
        };
      } else {
        console.error("[runAudit] reachability check failed unexpectedly:", err);
        reachability = {
          isReachable: false,
          finalUrl: null,
          httpStatus: null,
          httpsEnabled: null,
          redirectCount: 0,
          redirectChain: [] as string[],
          httpToHttpsRedirect: false,
          failureReason: "check_failed",
        };
      }
    }

    const finalUrl = reachability.finalUrl
      ? stripTrackingParams(new URL(reachability.finalUrl))
      : null;

    const { data: updatedWebsite, error: updateError } = await supabase
      .from("websites")
      .update({
        final_url: finalUrl,
        is_reachable: reachability.isReachable,
        http_status: reachability.httpStatus,
        https_enabled: reachability.httpsEnabled,
        redirect_count: reachability.redirectCount,
        redirect_chain: reachability.redirectChain,
        http_to_https_redirect: reachability.httpToHttpsRedirect,
        failure_reason: reachability.failureReason,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", website.id)
      .select("*")
      .single();

    if (updateError || !updatedWebsite) {
      console.error("[runAudit] failed to persist reachability check:", updateError);
      await supabase
        .from("audit_jobs")
        .update({ status: "failed", error_message: "reachability_write_failed" })
        .eq("id", job.id);
      return { ok: false, error: "Could not save the reachability check. Please try again." };
    }

    website = updatedWebsite;
  }

  const startedAt = new Date().toISOString();
  const websiteFacts = {
    isReachable: website.is_reachable,
    httpsEnabled: website.https_enabled,
    failureReason: website.failure_reason,
  };

  if (website.is_reachable !== true) {
    const findings = generateUnreachableFinding(websiteFacts);
    return writeAuditOutcome(supabase, job, {
      auditStatus: "completed",
      jobStatus: "completed",
      rawPagespeed: null,
      normalizedPagespeed: null,
      homepageMeta: emptyHomepageMeta(),
      findings,
      startedAt,
      summary: "Website unreachable — audit completed without a PageSpeed check or homepage scan.",
      jobErrorMessage: null,
    });
  }

  const targetUrl = website.final_url ?? website.input_url;
  let targetUrlObject: URL;
  try {
    targetUrlObject = new URL(targetUrl);
  } catch {
    console.error("[runAudit] website final_url/input_url is not a valid URL");
    await supabase
      .from("audit_jobs")
      .update({ status: "failed", error_message: "invalid_target_url" })
      .eq("id", job.id);
    return { ok: false, error: "This website's URL could not be audited." };
  }

  const [pagespeedSettled, scanSettled, sitemapRobotsSettled] = await Promise.allSettled([
    fetchMobilePageSpeed(targetUrl, serverEnv.GOOGLE_PAGESPEED_API_KEY),
    scanHomepage(targetUrlObject),
    checkSitemapAndRobots(targetUrlObject),
  ]);

  const pagespeedOk = pagespeedSettled.status === "fulfilled";
  const rawPagespeed = pagespeedOk ? pagespeedSettled.value : null;
  const normalizedPagespeed = pagespeedOk ? normalizePageSpeedResponse(rawPagespeed) : null;

  if (!pagespeedOk) {
    console.error(
      "[runAudit] PageSpeed request failed after retries:",
      classifyPageSpeedFailure(pagespeedSettled.reason),
    );
  }

  const scanResult: HomepageScanResult | null =
    scanSettled.status === "fulfilled" ? scanSettled.value : null;
  const htmlOk = scanResult?.ok === true;

  if (scanSettled.status === "rejected") {
    const reason = scanSettled.reason instanceof SsrfBlockedError ? "ssrf_blocked" : "unexpected_error";
    console.error("[runAudit] homepage scan threw:", reason);
  } else if (!htmlOk) {
    console.error("[runAudit] homepage scan did not complete:", scanResult?.failureReason);
  }

  const sitemapRobots: SitemapRobotsResult | null =
    sitemapRobotsSettled.status === "fulfilled" ? sitemapRobotsSettled.value : null;

  // Outcome D: both failed. No findings, no score — matches the
  // original "both fail" semantics exactly (nothing further to report).
  if (!pagespeedOk && !htmlOk) {
    return writeAuditOutcome(supabase, job, {
      auditStatus: "failed",
      jobStatus: "failed",
      rawPagespeed: null,
      normalizedPagespeed: null,
      homepageMeta: emptyHomepageMeta(),
      findings: [],
      startedAt,
      summary: "The PageSpeed check and homepage scan both failed for this website.",
      jobErrorMessage: "pagespeed_and_html_scan_failed",
    });
  }

  const findings: GeneratedFinding[] = [];
  let auditStatus: "completed" | "partial";
  let summary: string;

  if (pagespeedOk && htmlOk) {
    // Outcome A — pagespeedOk guarantees normalizedPagespeed is non-null here.
    const pagespeed = normalizedPagespeed as NormalizedPageSpeed;
    findings.push(...generateReachableFindings(websiteFacts, pagespeed));
    findings.push(...generateHtmlFindings(scanResult, new Date().getFullYear()));
    if (sitemapRobots) findings.push(...generateSitemapRobotsFindings(sitemapRobots));
    auditStatus = "completed";
    summary = buildSummary(pagespeed, findings.length);
  } else if (pagespeedOk && !htmlOk) {
    // Outcome B — pagespeedOk guarantees normalizedPagespeed is non-null here.
    // Preserve PageSpeed, do not generate absence-based HTML findings
    // since the scan didn't complete.
    const pagespeed = normalizedPagespeed as NormalizedPageSpeed;
    findings.push(...generateReachableFindings(websiteFacts, pagespeed));
    if (sitemapRobots) findings.push(...generateSitemapRobotsFindings(sitemapRobots));
    findings.push({
      category: "technical",
      findingType: "homepage_scan_incomplete",
      title: "Homepage content could not be fully reviewed",
      description:
        "The homepage HTML could not be retrieved or parsed, so content-based findings (call-to-action, contact form, trust signals, etc.) are not available for this audit.",
      evidence: null,
      sourceType: "html_scan",
      severity: "info",
      confidence: "manual_review",
      points: 0,
      ruleId: "homepage_scan_incomplete",
    });
    auditStatus = "completed";
    summary = buildSummary(pagespeed, findings.length);
  } else {
    // Outcome C — PageSpeed unavailable, HTML succeeded.
    findings.push(...generateReachableFindings(websiteFacts, null));
    findings.push(...generateHtmlFindings(scanResult as HomepageScanResult, new Date().getFullYear()));
    if (sitemapRobots) findings.push(...generateSitemapRobotsFindings(sitemapRobots));
    findings.push({
      category: "technical",
      findingType: "pagespeed_unavailable",
      title: "PageSpeed data unavailable",
      description:
        "The PageSpeed check did not succeed after retries, so mobile performance, accessibility, SEO, and best-practices scores are not available for this audit.",
      evidence: null,
      sourceType: "pagespeed",
      severity: "info",
      confidence: "verified",
      points: 0,
      ruleId: "pagespeed_unavailable",
    });
    auditStatus = "partial";
    summary = "Basic audit partially completed. PageSpeed data was unavailable; homepage content review completed.";
  }

  return writeAuditOutcome(supabase, job, {
    auditStatus,
    jobStatus: auditStatus,
    rawPagespeed: pagespeedOk ? rawPagespeed : null,
    normalizedPagespeed: pagespeedOk ? normalizedPagespeed : null,
    homepageMeta: htmlOk
      ? {
          homepageTitle: scanResult.homepageTitle,
          metaDescription: scanResult.metaDescription,
          canonicalUrl: scanResult.canonicalUrl,
          robotsMeta: scanResult.robotsMeta,
          h1Text: scanResult.h1Text,
          h1Count: scanResult.h1Count,
        }
      : emptyHomepageMeta(),
    findings,
    startedAt,
    summary,
    jobErrorMessage: null,
  });
}

function classifyPageSpeedFailure(err: unknown): string {
  if (err instanceof PageSpeedError) {
    return err.retryable ? "pagespeed_server_error" : "pagespeed_request_error";
  }
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return "pagespeed_timeout";
  }
  return "pagespeed_network_error";
}

function buildSummary(pagespeed: NormalizedPageSpeed, findingCount: number): string {
  const perf = pagespeed.performanceScore !== null ? `${pagespeed.performanceScore}` : "unavailable";
  return `Basic audit completed. Mobile performance score: ${perf}. ${findingCount} finding${
    findingCount === 1 ? "" : "s"
  } identified.`;
}

interface AuditOutcome {
  auditStatus: "completed" | "partial" | "failed";
  jobStatus: "completed" | "partial" | "failed";
  rawPagespeed: unknown;
  normalizedPagespeed: NormalizedPageSpeed | null;
  homepageMeta: HomepageMeta;
  findings: GeneratedFinding[];
  startedAt: string;
  summary: string;
  jobErrorMessage: string | null;
}

async function writeAuditOutcome(
  supabase: ServiceClient,
  job: AuditJobRow,
  outcome: AuditOutcome,
): Promise<RunAuditResult> {
  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .insert({
      audit_job_id: job.id,
      website_id: job.website_id,
      audit_depth: job.audit_depth,
      status: outcome.auditStatus,
      raw_pagespeed_mobile: outcome.rawPagespeed as Json | null,
      pagespeed_mobile: outcome.normalizedPagespeed as unknown as Json | null,
      homepage_title: outcome.homepageMeta.homepageTitle,
      meta_description: outcome.homepageMeta.metaDescription,
      canonical_url: outcome.homepageMeta.canonicalUrl,
      robots_meta: outcome.homepageMeta.robotsMeta,
      h1_text: outcome.homepageMeta.h1Text,
      h1_count: outcome.homepageMeta.h1Count,
      summary: outcome.summary,
      started_at: outcome.startedAt,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (auditError || !audit) {
    console.error("[runAudit] failed to insert audit record:", auditError);
    await supabase
      .from("audit_jobs")
      .update({ status: "failed", error_message: "audit_write_failed" })
      .eq("id", job.id);
    return { ok: false, error: "Could not save the audit results. Please try again." };
  }

  if (outcome.auditStatus === "failed") {
    // Outcome D: no findings/score for a full failure.
    const { error: jobUpdateError } = await supabase
      .from("audit_jobs")
      .update({ status: outcome.jobStatus, error_message: outcome.jobErrorMessage })
      .eq("id", job.id);
    if (jobUpdateError) {
      console.error("[runAudit] failed to mark job status after failed audit:", jobUpdateError);
    }
    return { ok: true, auditId: audit.id, status: outcome.jobStatus };
  }

  if (outcome.findings.length > 0) {
    const { error: findingsError } = await supabase.from("audit_findings").insert(
      outcome.findings.map((finding) => ({
        audit_id: audit.id,
        business_id: job.business_id,
        category: finding.category,
        finding_type: finding.findingType,
        title: finding.title,
        description: finding.description,
        evidence: finding.evidence,
        source_type: finding.sourceType,
        severity: finding.severity,
        confidence: finding.confidence,
        points: finding.points,
        rule_id: finding.ruleId,
      })),
    );

    if (findingsError) {
      console.error("[runAudit] failed to insert findings, rolling back audit:", findingsError);
      await supabase.from("audits").delete().eq("id", audit.id);
      await supabase
        .from("audit_jobs")
        .update({ status: "failed", error_message: "findings_write_failed" })
        .eq("id", job.id);
      return { ok: false, error: "Could not save the audit findings. Please try again." };
    }
  }

  const { score, breakdown } = calculateWebsiteNeedScore(outcome.findings);

  const { error: scoreError } = await supabase.from("audit_scores").insert({
    audit_id: audit.id,
    website_need_score: score,
    breakdown: breakdown as unknown as Json,
  });

  if (scoreError) {
    console.error("[runAudit] failed to insert score, rolling back audit:", scoreError);
    await supabase.from("audits").delete().eq("id", audit.id);
    await supabase
      .from("audit_jobs")
      .update({ status: "failed", error_message: "score_write_failed" })
      .eq("id", job.id);
    return { ok: false, error: "Could not save the audit score. Please try again." };
  }

  const { error: jobUpdateError } = await supabase
    .from("audit_jobs")
    .update({ status: outcome.jobStatus })
    .eq("id", job.id);

  if (jobUpdateError) {
    console.error("[runAudit] audit succeeded but failed to mark job status:", jobUpdateError);
  }

  return { ok: true, auditId: audit.id, status: outcome.jobStatus };
}
