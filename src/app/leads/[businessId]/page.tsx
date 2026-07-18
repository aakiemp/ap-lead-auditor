import Link from "next/link";
import { notFound } from "next/navigation";

import { buildAuditSummaryText } from "@/lib/audit/build-summary-text";
import type { NormalizedPageSpeed } from "@/lib/audit/normalize-pagespeed";
import { calculateEffectiveScore } from "@/lib/scoring/effective-score";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { AuditFinding, DeviceType } from "@/lib/supabase/database.types";

import { CaptureScreenshotsButton } from "./capture-screenshots-button";
import { CopySummaryButton } from "./copy-summary-button";
import { FindingStatusButton } from "./finding-status-button";
import { RunAuditButton } from "./run-audit-button";

const SCREENSHOT_SIGNED_URL_TTL_SECONDS = 3600;
const DEVICE_TYPES: DeviceType[] = ["mobile", "desktop"];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

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

  const findings = latestAudit
    ? (
        await supabase
          .from("audit_findings")
          .select("*")
          .eq("audit_id", latestAudit.id)
          .order("points", { ascending: false })
      ).data ?? []
    : [];

  const screenshots = latestAudit
    ? (
        await supabase
          .from("screenshots")
          .select("*")
          .eq("audit_id", latestAudit.id)
      ).data ?? []
    : [];

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
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/leads" className="text-sm text-zinc-500 hover:text-zinc-700">
              ← Leads
            </Link>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">{business.name}</h1>
          </div>
          {summaryText ? <CopySummaryButton text={summaryText} /> : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-6 px-8 py-10">
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-medium text-zinc-900">Business</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Detail label="City" value={business.city} />
            <Detail label="State" value={business.state} />
            <Detail label="Phone" value={business.phone} />
            <Detail label="Source" value={business.source} />
          </dl>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-medium text-zinc-900">Website</h2>
          {website ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Detail label="Submitted URL" value={website.input_url} />
              <Detail label="Final URL" value={website.final_url} />
              <Detail label="Reachable" value={formatBoolean(website.is_reachable)} />
              <Detail label="HTTP status" value={website.http_status?.toString() ?? null} />
              <Detail label="HTTPS enabled" value={formatBoolean(website.https_enabled)} />
              <Detail label="Redirect count" value={website.redirect_count?.toString() ?? null} />
              <Detail
                label="HTTP → HTTPS redirect"
                value={formatBoolean(website.http_to_https_redirect)}
              />
              <Detail label="Failure reason" value={website.failure_reason} />
              <Detail
                label="Last checked"
                value={website.last_checked_at ? new Date(website.last_checked_at).toLocaleString() : null}
              />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No website record found.</p>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-medium text-zinc-900">Audit jobs</h2>
          {!jobs || jobs.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No audit jobs yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2"
                >
                  <span className="text-zinc-700">{job.audit_depth} audit</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {job.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {claimableJob ? (
            <RunAuditButton businessId={businessId} jobId={claimableJob.id} />
          ) : null}
        </section>

        {latestAudit ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-medium text-zinc-900">Basic audit</h2>
            <p className="mt-1 text-sm text-zinc-500">{latestAudit.summary}</p>

            {latestAudit.status === "failed" ? (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                This audit attempt failed
                {jobs?.[0]?.error_message ? `: ${jobs[0].error_message}` : "."}
              </p>
            ) : null}

            {pagespeed ? (
              <>
                <div className="mt-4 grid grid-cols-4 gap-3">
                  <ScoreCard label="Performance" value={pagespeed.performanceScore} />
                  <ScoreCard label="Accessibility" value={pagespeed.accessibilityScore} />
                  <ScoreCard label="SEO" value={pagespeed.seoScore} />
                  <ScoreCard label="Best practices" value={pagespeed.bestPracticesScore} />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <Detail label="First Contentful Paint" value={pagespeed.firstContentfulPaintDisplay} />
                  <Detail label="Largest Contentful Paint" value={pagespeed.largestContentfulPaintDisplay} />
                  <Detail label="Cumulative Layout Shift" value={pagespeed.cumulativeLayoutShiftDisplay} />
                  <Detail label="Total Blocking Time" value={pagespeed.totalBlockingTimeDisplay} />
                  <Detail label="Speed Index" value={pagespeed.speedIndexDisplay} />
                </dl>
              </>
            ) : null}
          </section>
        ) : null}

        {latestAudit && website?.is_reachable === true ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-medium text-zinc-900">Screenshots</h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <ScreenshotCard label="Mobile" url={signedScreenshotUrls.mobile} />
              <ScreenshotCard label="Desktop" url={signedScreenshotUrls.desktop} />
            </div>
            {canCaptureScreenshots ? (
              <CaptureScreenshotsButton businessId={businessId} auditId={latestAudit.id} />
            ) : null}
          </section>
        ) : null}

        {latestAudit ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-medium text-zinc-900">Website-need score</h2>
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
          </section>
        ) : null}

        {findings.length > 0 ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-medium text-zinc-900">Findings</h2>
            <FindingGroup title="Verified" findings={verifiedFindings} businessId={businessId} />
            <FindingGroup title="Active" findings={activeFindings} businessId={businessId} />
            <FindingGroup title="Manual review needed" findings={manualReviewFindings} businessId={businessId} />
            <FindingGroup title="Dismissed" findings={dismissedFindings} businessId={businessId} />
          </section>
        ) : null}
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
              <div className="flex gap-1.5">
                <Badge>{finding.severity}</Badge>
                <Badge>{finding.confidence}</Badge>
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

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
      {children}
    </span>
  );
}
