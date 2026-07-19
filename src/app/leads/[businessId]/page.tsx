import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, CardHeader, TestDataBadge, type BadgeVariant } from "@/components/ui";
import { buildAuditSummaryText } from "@/lib/audit/build-summary-text";
import type { NormalizedPageSpeed } from "@/lib/audit/normalize-pagespeed";
import { defaultLeadProfile, getFollowUpState, getTodayISODate } from "@/lib/pipeline/lead-profile";
import { LEAD_STATUS_LABELS } from "@/lib/pipeline/pipeline-status";
import { validateReturnTo } from "@/lib/nav/return-to";
import { calculateEffectiveScore } from "@/lib/scoring/effective-score";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { AuditFinding, DeviceType, FindingConfidence, FindingSeverity } from "@/lib/supabase/database.types";

import { CaptureScreenshotsButton } from "./capture-screenshots-button";
import { CopySummaryButton } from "./copy-summary-button";
import { FindingStatusButton } from "./finding-status-button";
import { PipelinePanel } from "./pipeline-panel";
import { RunAuditButton } from "./run-audit-button";

const SCREENSHOT_SIGNED_URL_TTL_SECONDS = 3600;
const DEVICE_TYPES: DeviceType[] = ["mobile", "desktop"];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { businessId } = await params;
  const { returnTo } = await searchParams;
  const leadsHref = validateReturnTo(returnTo);

  if (!UUID_PATTERN.test(businessId)) {
    notFound();
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) {
    notFound();
  }

  const [{ data: website }, { data: jobs }] = await Promise.all([
    supabase.from("websites").select("*").eq("business_id", businessId).maybeSingle(),
    supabase
      .from("audit_jobs")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
  ]);

  const latestAudit = website
    ? (
        await supabase
          .from("audits")
          .select("*")
          .eq("website_id", website.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data
    : null;

  // Both only depend on latestAudit.id and are otherwise independent
  // of each other -- run concurrently rather than as two sequential
  // round trips.
  const [{ data: findingsData }, { data: screenshotsData }] = latestAudit
    ? await Promise.all([
        supabase
          .from("audit_findings")
          .select("*")
          .eq("audit_id", latestAudit.id)
          .order("points", { ascending: false }),
        supabase.from("screenshots").select("*").eq("audit_id", latestAudit.id),
      ])
    : [{ data: null }, { data: null }];

  const findings = findingsData ?? [];
  const screenshots = screenshotsData ?? [];

  const screenshotByDevice = new Map(screenshots.map((s) => [s.device_type, s]));

  const signedScreenshotUrls = Object.fromEntries(
    await Promise.all(
      DEVICE_TYPES.map(async (device) => {
        const screenshot = screenshotByDevice.get(device);
        if (!screenshot) return [device, null] as const;
        const { data: signed } = await supabase.storage
          .from("screenshots")
          .createSignedUrl(screenshot.storage_path, SCREENSHOT_SIGNED_URL_TTL_SECONDS);
        return [device, signed?.signedUrl ?? null] as const;
      }),
    ),
  ) as Record<DeviceType, string | null>;

  const missingDeviceTypes = DEVICE_TYPES.filter((device) => !screenshotByDevice.has(device));
  const canCaptureScreenshots =
    website?.is_reachable === true && latestAudit !== null && missingDeviceTypes.length > 0;

  const claimableJob = (jobs ?? []).find((job) => job.status === "queued" || job.status === "pending");
  const pagespeed = latestAudit?.pagespeed_mobile as NormalizedPageSpeed | null;

  const verifiedFindings = findings.filter((f) => f.status === "verified");
  const activeFindings = findings.filter((f) => f.status === "active" && f.confidence !== "manual_review");
  const manualReviewFindings = findings.filter(
    (f) => f.status === "active" && f.confidence === "manual_review",
  );
  const dismissedFindings = findings.filter((f) => f.status === "dismissed");

  const { score: effectiveScore, breakdown: effectiveBreakdown } = calculateEffectiveScore(findings);

  // Independent of each other and of the audit data above -- both
  // depend only on businessId, so they run concurrently rather than
  // as two sequential round trips.
  const [{ data: fetchedProfile }, { data: activity }] = await Promise.all([
    supabase.from("lead_profiles").select("*").eq("business_id", businessId).maybeSingle(),
    supabase
      .from("lead_activity")
      .select("id, from_status, to_status, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Every business should have exactly one lead_profiles row (see the
  // Phase 11 migration) — this fallback is defensive only, not the
  // normal path.
  const leadProfile = fetchedProfile ?? defaultLeadProfile(businessId);

  const followUpState = getFollowUpState(
    leadProfile.next_follow_up_date,
    leadProfile.status,
    getTodayISODate(),
  );

  const summaryText = latestAudit
    ? buildAuditSummaryText({
        business,
        website,
        pagespeed,
        effectiveScore,
        effectiveBreakdown,
        verifiedFindings,
        activeFindings,
        manualReviewFindings,
        dismissedFindings,
      })
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
              <Link href={leadsHref} className="hover:text-zinc-700">
                Leads
              </Link>
              <span className="mx-1.5">/</span>
              <span className="text-zinc-700">{business.name}</span>
            </nav>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">
              {business.name}
              {business.is_test ? (
                <span className="ml-2 align-middle">
                  <TestDataBadge />
                </span>
              ) : null}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {latestAudit ? (
              <Link
                href={`/leads/${businessId}/outreach`}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Prepare outreach
              </Link>
            ) : null}
            {summaryText ? <CopySummaryButton text={summaryText} /> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-8">
        <Card>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Website</dt>
              <dd className="mt-0.5 truncate text-zinc-800">
                {website?.final_url ?? website?.input_url ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Source</dt>
              <dd className="mt-0.5 text-zinc-800">
                {business.source === "google_places" ? "Google Places" : "Manual"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Pipeline status</dt>
              <dd className="mt-0.5 text-zinc-800">{LEAD_STATUS_LABELS[leadProfile.status]}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Priority</dt>
              <dd className="mt-0.5 text-zinc-800">{leadProfile.priority ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Latest audit</dt>
              <dd className="mt-0.5 text-zinc-800">{latestAudit ? latestAudit.status : "Not run yet"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Website-opportunity score</dt>
              <dd className="mt-0.5 text-zinc-800">{latestAudit ? effectiveScore : "—"}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
            {claimableJob ? (
              <RunAuditButton businessId={businessId} jobId={claimableJob.id} />
            ) : null}
            {latestAudit ? (
              <Link
                href={`/leads/${businessId}/outreach`}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Prepare outreach
              </Link>
            ) : null}
            {canCaptureScreenshots ? (
              <CaptureScreenshotsButton businessId={businessId} auditId={latestAudit!.id} />
            ) : null}
          </div>
        </Card>

        {/* Pipeline state -- current status controls plus its immutable history, kept visually adjacent */}
        <PipelinePanel
          businessId={businessId}
          data={{
            status: leadProfile.status,
            priority: leadProfile.priority,
            notes: leadProfile.notes,
            outreachAngle: leadProfile.outreach_angle,
            lastContactedDate: leadProfile.last_contacted_date,
            nextFollowUpDate: leadProfile.next_follow_up_date,
          }}
          followUpState={followUpState}
        />

        <Card>
          <CardHeader>Status history</CardHeader>
          {!activity || activity.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No status changes have been recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                  <span className="text-zinc-700">
                    {entry.from_status ? LEAD_STATUS_LABELS[entry.from_status] : "—"} → {LEAD_STATUS_LABELS[entry.to_status]}
                  </span>
                  <span className="text-xs text-zinc-400">{new Date(entry.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Audit summary -- PageSpeed scores and the website-need score together, since both answer "how did the audit go" */}
        {latestAudit ? (
          <Card>
            <CardHeader>Audit summary</CardHeader>
            <p className="mt-1 text-sm text-zinc-500">{latestAudit.summary}</p>

            {latestAudit.status === "failed" ? (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                This audit attempt failed
                {jobs?.[0]?.error_message ? `: ${jobs[0].error_message}` : "."}
              </p>
            ) : null}

            {latestAudit.status === "partial" ? (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                This audit is partial — one of the PageSpeed check or homepage scan did not complete.
                See findings below for details.
              </p>
            ) : null}

            {pagespeed ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <ScoreCard label="Performance" value={pagespeed.performanceScore} />
                  <ScoreCard label="Accessibility" value={pagespeed.accessibilityScore} />
                  <ScoreCard label="SEO" value={pagespeed.seoScore} />
                  <ScoreCard label="Best practices" value={pagespeed.bestPracticesScore} />
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <Detail label="First Contentful Paint" value={pagespeed.firstContentfulPaintDisplay} />
                  <Detail label="Largest Contentful Paint" value={pagespeed.largestContentfulPaintDisplay} />
                  <Detail label="Cumulative Layout Shift" value={pagespeed.cumulativeLayoutShiftDisplay} />
                  <Detail label="Total Blocking Time" value={pagespeed.totalBlockingTimeDisplay} />
                  <Detail label="Speed Index" value={pagespeed.speedIndexDisplay} />
                </dl>
              </>
            ) : null}

            <div className="mt-6 border-t border-zinc-100 pt-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Website-need score</p>
              <p className="mt-1 text-3xl font-semibold text-zinc-900">{effectiveScore}</p>
              {dismissedFindings.length > 0 ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {dismissedFindings.length} dismissed finding{dismissedFindings.length === 1 ? "" : "s"} excluded
                  from this score.
                </p>
              ) : null}
              {effectiveBreakdown.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {effectiveBreakdown.map((entry) => (
                    <li key={entry.ruleId} className="flex items-center justify-between">
                      <span className="text-zinc-600">{entry.label}</span>
                      <span className="font-medium text-zinc-900">+{entry.points}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">No point-earning findings.</p>
              )}
            </div>
          </Card>
        ) : null}

        {/* Findings -- the primary evidence this whole audit produces, kept prominent and never behind a disclosure */}
        <Card>
          <CardHeader>Findings</CardHeader>
          {findings.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              {latestAudit ? "This audit produced no findings." : "No audit has been run yet."}
            </p>
          ) : (
            <>
              <FindingGroup title="Verified" findings={verifiedFindings} businessId={businessId} />
              <FindingGroup title="Active" findings={activeFindings} businessId={businessId} />
              <FindingGroup title="Manual review needed" findings={manualReviewFindings} businessId={businessId} />
              <FindingGroup title="Dismissed" findings={dismissedFindings} businessId={businessId} />
            </>
          )}
        </Card>

        {/* Screenshots -- visual evidence, kept prominent */}
        {latestAudit && website?.is_reachable === true ? (
          <Card>
            <CardHeader>Screenshots</CardHeader>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ScreenshotCard label="Mobile" url={signedScreenshotUrls.mobile} />
              <ScreenshotCard label="Desktop" url={signedScreenshotUrls.desktop} />
            </div>
          </Card>
        ) : null}

        {/*
          Technical details -- lower-priority, rarely-needed raw fields
          (business record, website reachability internals, the job
          history, raw homepage HTML metadata). Grouped into one
          visually-subordinate card and left OPEN by default via a
          native <details> element: this both signals lower priority
          than the sections above and keeps every field fully in the
          DOM and screen-reader-discoverable, never hidden behind an
          interaction the operator has to know to trigger.
        */}
        <details open className="group rounded-lg border border-zinc-200 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-zinc-700 sm:px-6">
            Technical details
          </summary>
          <div className="space-y-6 border-t border-zinc-100 px-4 pb-6 pt-4 sm:px-6">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Business</h3>
              <dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Detail label="City" value={business.city} />
                <Detail label="State" value={business.state} />
                <Detail label="Phone" value={business.phone} />
                <Detail label="Source" value={business.source} />
              </dl>
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Website</h3>
              {website ? (
                <dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <Detail label="Submitted URL" value={website.input_url} />
                  <Detail label="Final URL" value={website.final_url} />
                  <Detail label="Reachable" value={formatBoolean(website.is_reachable)} />
                  <Detail label="HTTP status" value={website.http_status?.toString() ?? null} />
                  <Detail label="HTTPS enabled" value={formatBoolean(website.https_enabled)} />
                  <Detail label="Redirect count" value={website.redirect_count?.toString() ?? null} />
                  <Detail label="HTTP → HTTPS redirect" value={formatBoolean(website.http_to_https_redirect)} />
                  <Detail label="Failure reason" value={website.failure_reason} />
                  <Detail
                    label="Last checked"
                    value={website.last_checked_at ? new Date(website.last_checked_at).toLocaleString() : null}
                  />
                </dl>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No website record found.</p>
              )}
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Audit jobs</h3>
              {!jobs || jobs.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">No audit jobs yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {jobs.map((job) => (
                    <li
                      key={job.id}
                      className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2"
                    >
                      <span className="text-zinc-700">{job.audit_depth} audit</span>
                      <Badge>{job.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {latestAudit ? (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Homepage HTML</h3>
                <dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <Detail label="Page title" value={latestAudit.homepage_title} />
                  <Detail label="Meta description" value={latestAudit.meta_description} />
                  <Detail label="Canonical URL" value={latestAudit.canonical_url} />
                  <Detail label="Robots meta" value={latestAudit.robots_meta} />
                  <Detail label="H1 text" value={latestAudit.h1_text} />
                  <Detail label="H1 count" value={latestAudit.h1_count?.toString() ?? null} />
                </dl>
              </div>
            ) : null}
          </div>
        </details>
      </main>
    </div>
  );
}

function FindingGroup({
  title,
  findings,
  businessId,
}: {
  title: string;
  findings: AuditFinding[];
  businessId: string;
}) {
  if (findings.length === 0) return null;

  return (
    <div className="mt-4 first:mt-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</h3>
      <ul className="mt-2 space-y-3">
        {findings.map((finding) => (
          <li key={finding.id} className="rounded-md border border-zinc-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-900">{finding.title}</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
                <Badge variant={confidenceVariant(finding.confidence)}>{finding.confidence}</Badge>
              </div>
            </div>
            <p className="mt-1 text-sm text-zinc-600">{finding.description}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {finding.category} · +{finding.points} pts
            </p>
            <div className="mt-2 flex gap-2">
              {finding.status !== "verified" ? (
                <FindingStatusButton
                  businessId={businessId}
                  findingId={finding.id}
                  targetStatus="verified"
                  label="Verify"
                />
              ) : null}
              {finding.status !== "dismissed" ? (
                <FindingStatusButton
                  businessId={businessId}
                  findingId={finding.id}
                  targetStatus="dismissed"
                  label="Dismiss"
                />
              ) : null}
              {finding.status !== "active" ? (
                <FindingStatusButton
                  businessId={businessId}
                  findingId={finding.id}
                  targetStatus="active"
                  label="Restore to active"
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatBoolean(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Yes" : "No";
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="text-zinc-800">{value || "—"}</dd>
    </div>
  );
}

function ScreenshotCard({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      {url ? (
        // Signed URLs are short-lived and dynamically generated per
        // request, not a fixed domain suitable for next/image's static
        // remotePatterns allowlist — a plain <img> is the simpler fit.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`${label} homepage screenshot`}
          className="mt-1 w-full rounded-md border border-zinc-200"
        />
      ) : (
        <div className="mt-1 flex h-32 items-center justify-center rounded-md border border-dashed border-zinc-300 text-xs text-zinc-400">
          Not captured
        </div>
      )}
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-900">{value ?? "—"}</p>
    </div>
  );
}

function severityVariant(severity: FindingSeverity): BadgeVariant {
  if (severity === "critical" || severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "neutral";
}

function confidenceVariant(confidence: FindingConfidence): BadgeVariant {
  if (confidence === "verified") return "success";
  if (confidence === "manual_review") return "warning";
  return "neutral";
}
