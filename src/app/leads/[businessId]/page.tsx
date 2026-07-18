import Link from "next/link";
import { notFound } from "next/navigation";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { NormalizedPageSpeed } from "@/lib/audit/normalize-pagespeed";
import type { ScoreBreakdownEntry } from "@/lib/scoring/website-need-score";

import { RunAuditButton } from "./run-audit-button";

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

  const [{ data: findings }, { data: score }] = latestAudit
    ? await Promise.all([
        supabase
          .from("audit_findings")
          .select("*")
          .eq("audit_id", latestAudit.id)
          .order("points", { ascending: false }),
        supabase.from("audit_scores").select("*").eq("audit_id", latestAudit.id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const claimableJob = (jobs ?? []).find((job) => job.status === "queued" || job.status === "pending");
  const pagespeed = latestAudit?.pagespeed_mobile as NormalizedPageSpeed | null;
  const breakdown = (score?.breakdown as ScoreBreakdownEntry[] | null) ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <Link href="/leads" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Leads
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">{business.name}</h1>
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

        {score ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-medium text-zinc-900">Website-need score</h2>
            <p className="mt-1 text-3xl font-semibold text-zinc-900">{score.website_need_score}</p>
            {breakdown.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {breakdown.map((entry) => (
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

        {findings && findings.length > 0 ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-medium text-zinc-900">Findings</h2>
            <ul className="mt-3 space-y-3">
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
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
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
