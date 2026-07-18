import "server-only";

import {
  generateReachableFindings,
  generateUnreachableFinding,
  type GeneratedFinding,
} from "@/lib/audit/generate-findings";
import { normalizePageSpeedResponse, type NormalizedPageSpeed } from "@/lib/audit/normalize-pagespeed";
import { fetchMobilePageSpeed, PageSpeedError } from "@/lib/audit/pagespeed";
import { serverEnv } from "@/lib/env";
import { calculateWebsiteNeedScore } from "@/lib/scoring/website-need-score";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type RunAuditResult =
  | { ok: true; auditId: string }
  | { ok: false; error: string };

const CLAIMED_BY = "manual-ui";

/**
 * Processes one existing audit_jobs row: atomically claims it (only
 * from queued/pending), skips PageSpeed entirely for a website that
 * isn't known-reachable, otherwise calls PageSpeed mobile, normalizes
 * the response, generates findings, computes the website-need score,
 * and writes audits -> audit_findings -> audit_scores in that order.
 * A failure after the audits row is created deletes it (cascades clean
 * up any partial children) and marks the job failed — see CLAUDE.md
 * for why this mirrors the Phase 3 write pattern rather than a
 * transactional RPC.
 */
export async function runAudit(jobId: string): Promise<RunAuditResult> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: job, error: claimError } = await supabase
    .from("audit_jobs")
    .update({
      status: "auditing",
      claimed_at: new Date().toISOString(),
      claimed_by: CLAIMED_BY,
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
    return { ok: false, error: "This audit is already running or has already finished." };
  }

  const { data: website, error: websiteError } = await supabase
    .from("websites")
    .select("*")
    .eq("id", job.website_id)
    .maybeSingle();

  if (websiteError || !website) {
    console.error("[runAudit] website lookup failed:", websiteError);
    await supabase
      .from("audit_jobs")
      .update({ status: "failed", error_message: "website_not_found" })
      .eq("id", job.id);
    return { ok: false, error: "Could not find the website record for this audit." };
  }

  const startedAt = new Date().toISOString();
  const websiteFacts = {
    isReachable: website.is_reachable,
    httpsEnabled: website.https_enabled,
    failureReason: website.failure_reason,
  };

  if (website.is_reachable !== true) {
    const findings = generateUnreachableFinding(websiteFacts);
    return finishSuccessfulAudit(supabase, job, findings, {
      rawPagespeed: null,
      normalizedPagespeed: null,
      startedAt,
      summary: "Website unreachable — audit completed without a PageSpeed check.",
    });
  }

  const targetUrl = website.final_url ?? website.input_url;

  let rawPagespeed: unknown;
  try {
    rawPagespeed = await fetchMobilePageSpeed(targetUrl, serverEnv.GOOGLE_PAGESPEED_API_KEY);
  } catch (err) {
    const reason = classifyPageSpeedFailure(err);
    console.error("[runAudit] PageSpeed request failed after retries:", reason, err);
    await createFailedAudit(supabase, job, startedAt, reason);
    return {
      ok: false,
      error: "The PageSpeed check failed after retries. You can try running the audit again.",
    };
  }

  const normalizedPagespeed = normalizePageSpeedResponse(rawPagespeed);
  const findings = generateReachableFindings(websiteFacts, normalizedPagespeed);

  return finishSuccessfulAudit(supabase, job, findings, {
    rawPagespeed,
    normalizedPagespeed,
    startedAt,
    summary: buildSummary(normalizedPagespeed, findings.length),
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
  return `Basic mobile audit completed. Mobile performance score: ${perf}. ${findingCount} finding${
    findingCount === 1 ? "" : "s"
  } identified.`;
}

interface AuditJobRow {
  id: string;
  business_id: string;
  website_id: string;
  audit_depth: "discovery_only" | "basic" | "deep";
}

async function createFailedAudit(
  supabase: ServiceClient,
  job: AuditJobRow,
  startedAt: string,
  reason: string,
): Promise<void> {
  const { error: auditError } = await supabase.from("audits").insert({
    audit_job_id: job.id,
    website_id: job.website_id,
    audit_depth: job.audit_depth,
    status: "failed",
    raw_pagespeed_mobile: null,
    pagespeed_mobile: null,
    summary: "The PageSpeed check could not be completed for this website.",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  });

  if (auditError) {
    console.error("[runAudit] failed to insert failed-audit record:", auditError);
  }

  const { error: jobError } = await supabase
    .from("audit_jobs")
    .update({ status: "failed", error_message: reason })
    .eq("id", job.id);

  if (jobError) {
    console.error("[runAudit] failed to mark job failed:", jobError);
  }
}

async function finishSuccessfulAudit(
  supabase: ServiceClient,
  job: AuditJobRow,
  findings: GeneratedFinding[],
  data: {
    rawPagespeed: unknown;
    normalizedPagespeed: NormalizedPageSpeed | null;
    startedAt: string;
    summary: string;
  },
): Promise<RunAuditResult> {
  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .insert({
      audit_job_id: job.id,
      website_id: job.website_id,
      audit_depth: job.audit_depth,
      status: "completed",
      raw_pagespeed_mobile: data.rawPagespeed as Json | null,
      pagespeed_mobile: data.normalizedPagespeed as unknown as Json | null,
      summary: data.summary,
      started_at: data.startedAt,
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

  if (findings.length > 0) {
    const { error: findingsError } = await supabase.from("audit_findings").insert(
      findings.map((finding) => ({
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

  const { score, breakdown } = calculateWebsiteNeedScore(findings);

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
    .update({ status: "completed" })
    .eq("id", job.id);

  if (jobUpdateError) {
    console.error("[runAudit] audit succeeded but failed to mark job completed:", jobUpdateError);
  }

  return { ok: true, auditId: audit.id };
}
