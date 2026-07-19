import Link from "next/link";

import { Card, CardHeader, PageHeader } from "@/components/ui";
import { isStaleAuditingJob } from "@/lib/audit/stale-job";
import { getFollowUpState, getTodayISODate } from "@/lib/pipeline/lead-profile";
import { LEAD_STATUS_LABELS } from "@/lib/pipeline/pipeline-status";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/supabase/database.types";

// This page reads no dynamic API (no searchParams, cookies, headers)
// but its data absolutely must be live -- without this, Next.js's
// automatic static-generation detection has no signal to avoid
// prerendering it once at build time and serving that frozen snapshot
// forever after (confirmed empirically: `next build` marked this route
// "○ (Static)" before this line was added). Every other page in this
// app reads searchParams, which opts it into dynamic rendering
// automatically -- this is the one page that needed an explicit,
// unambiguous override instead.
export const dynamic = "force-dynamic";

const STALE_THRESHOLD_MS = 15 * 60 * 1000;
const RECENT_AUDITS_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 10;
const RECENT_SEARCHES_LIMIT = 5;
const RECENT_FAILURES_LIMIT = 3;
// Fetched larger than the display limit so trimming to production-only
// results (done client-side against the id set, not by re-querying)
// still leaves enough rows to fill the display limit in the common
// case without a second round trip.
const AUDIT_FETCH_BUFFER = 20;
const ACTIVITY_FETCH_BUFFER = 20;

const PIPELINE_STATUSES: LeadStatus[] = ["new", "reviewing", "qualified", "outreach_ready", "contacted"];

export default async function DashboardPage() {
  const supabase = createSupabaseServiceRoleClient();
  const today = getTodayISODate();

  // Every business, narrow columns only (id/name/is_test, never a
  // full row) -- this is the one query every other section below
  // depends on to exclude test data, since none of lead_profiles,
  // audit_jobs, audits, or lead_activity carry is_test themselves
  // (see CLAUDE.md "Roadmap" / Phase 12: only businesses and searches
  // do). Reused as a name lookup too, so this is not "fetching a full
  // record collection merely to calculate counts."
  const { data: allBusinesses } = await supabase.from("businesses").select("id, name, is_test");
  const businessById = new Map((allBusinesses ?? []).map((b) => [b.id, b]));
  const productionBusinessIds = (allBusinesses ?? []).filter((b) => !b.is_test).map((b) => b.id);
  const hasProductionBusinesses = productionBusinessIds.length > 0;

  // Six independent queries, run concurrently. audits (Q5 below, for
  // "recent audits") is the one section that can't join here -- audits
  // only stores website_id, not business_id, so resolving it to a
  // business/production check needs one more, dependent query below.
  const [
    { data: leadProfilesData },
    { data: activeJobsData },
    { data: failedJobsData },
    { data: recentAuditsData },
    { data: recentActivityData },
    { data: recentSearchesData },
  ] = hasProductionBusinesses
    ? await Promise.all([
        supabase.from("lead_profiles").select("business_id, status, next_follow_up_date").in("business_id", productionBusinessIds),
        supabase
          .from("audit_jobs")
          .select("business_id, status, claimed_at")
          .eq("audit_depth", "basic")
          .in("status", ["queued", "pending", "auditing"])
          .in("business_id", productionBusinessIds),
        supabase
          .from("audit_jobs")
          .select("business_id, created_at")
          .eq("audit_depth", "basic")
          .eq("status", "failed")
          .in("business_id", productionBusinessIds)
          .order("created_at", { ascending: false })
          .limit(RECENT_FAILURES_LIMIT),
        supabase
          .from("audits")
          .select("id, website_id, status, created_at")
          .in("status", ["completed", "partial"])
          .order("created_at", { ascending: false })
          .limit(AUDIT_FETCH_BUFFER),
        supabase
          .from("lead_activity")
          .select("business_id, from_status, to_status, created_at")
          .in("business_id", productionBusinessIds)
          .order("created_at", { ascending: false })
          .limit(ACTIVITY_FETCH_BUFFER),
        supabase
          .from("searches")
          .select("id, niche, city, state, status, created_at")
          .eq("is_test", false)
          .order("created_at", { ascending: false })
          .limit(RECENT_SEARCHES_LIMIT + RECENT_FAILURES_LIMIT),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const leadProfiles = leadProfilesData ?? [];
  const activeJobs = activeJobsData ?? [];
  const failedJobs = failedJobsData ?? [];
  const recentAuditsRaw = recentAuditsData ?? [];
  const recentActivityRaw = recentActivityData ?? [];
  const recentSearches = recentSearchesData ?? [];

  // --- Pipeline counts + Attention (from lead_profiles) ---
  const pipelineCounts: Record<string, number> = {};
  let overdueCount = 0;
  let dueTodayCount = 0;
  for (const p of leadProfiles) {
    pipelineCounts[p.status] = (pipelineCounts[p.status] ?? 0) + 1;
    const followUp = getFollowUpState(p.next_follow_up_date, p.status, today);
    if (followUp === "overdue") overdueCount++;
    else if (followUp === "due_today") dueTodayCount++;
  }

  // --- Audit activity: queued/running/stale (from activeJobs) ---
  let queuedCount = 0;
  let runningCount = 0;
  let staleCount = 0;
  for (const job of activeJobs) {
    if (job.status === "queued" || job.status === "pending") queuedCount++;
    else if (job.status === "auditing") {
      runningCount++;
      if (isStaleAuditingJob(job.status, job.claimed_at, STALE_THRESHOLD_MS)) staleCount++;
    }
  }

  // --- Recent completed/partial audits: resolve website_id -> business, drop test/unknown, trim ---
  const recentAuditWebsiteIds = Array.from(new Set(recentAuditsRaw.map((a) => a.website_id)));
  const { data: recentAuditWebsites } =
    recentAuditWebsiteIds.length > 0
      ? await supabase.from("websites").select("id, business_id").in("id", recentAuditWebsiteIds)
      : { data: [] };
  const businessIdByWebsiteId = new Map((recentAuditWebsites ?? []).map((w) => [w.id, w.business_id]));

  const recentAudits = recentAuditsRaw
    .map((audit) => {
      const businessId = businessIdByWebsiteId.get(audit.website_id);
      const business = businessId ? businessById.get(businessId) : undefined;
      if (!businessId || !business || business.is_test) return null;
      return { id: audit.id, businessId, businessName: business.name, status: audit.status, createdAt: audit.created_at };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .slice(0, RECENT_AUDITS_LIMIT);

  // --- Recent pipeline activity: already production-only (queried that way), just trim + resolve names ---
  const recentActivity = recentActivityRaw
    .map((entry) => {
      const business = businessById.get(entry.business_id);
      if (!business) return null;
      return {
        businessId: entry.business_id,
        businessName: business.name,
        fromStatus: entry.from_status as LeadStatus | null,
        toStatus: entry.to_status as LeadStatus,
        createdAt: entry.created_at,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .slice(0, RECENT_ACTIVITY_LIMIT);

  // --- Recent production searches + recent sanitized search failures (one fetch, two views) ---
  const recentSearchesTrimmed = recentSearches.slice(0, RECENT_SEARCHES_LIMIT);
  const recentFailedSearches = recentSearches.filter((s) => s.status === "failed").slice(0, RECENT_FAILURES_LIMIT);

  const recentFailures = [
    ...failedJobs.map((job) => ({
      kind: "audit" as const,
      label: businessById.get(job.business_id)?.name ?? "Unknown business",
      createdAt: job.created_at,
    })),
    ...recentFailedSearches.map((s) => ({
      kind: "search" as const,
      label: `${s.niche} — ${[s.city, s.state].filter(Boolean).join(", ")}`,
      createdAt: s.created_at,
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, RECENT_FAILURES_LIMIT);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <PageHeader title="AP Webmaster — Lead Auditor" description="Internal lead research and website audit tool" />

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-8">
        <nav aria-label="Quick actions" className="flex flex-wrap gap-3">
          <QuickAction href="/leads" label="Find leads" primary />
          <QuickAction href="/leads/new" label="Add lead manually" />
          <QuickAction href="/queue" label="Open audit queue" />
          <QuickAction href="/leads?overdue=1" label="Review overdue follow-ups" />
          <QuickAction href="/leads?status=outreach_ready" label="View outreach-ready leads" />
        </nav>

        <Card>
          <CardHeader>Attention</CardHeader>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Overdue follow-ups" value={overdueCount} href="/leads?overdue=1" warn={overdueCount > 0} />
            <StatCard label="Due today" value={dueTodayCount} href="/leads?overdue=1" />
            <StatCard label="Possibly stale jobs" value={staleCount} href="/queue" warn={staleCount > 0} />
            <StatCard label="Recent failures" value={recentFailures.length} href="/queue" />
          </div>
          {recentFailures.length > 0 ? (
            <ul className="mt-4 space-y-1.5 border-t border-zinc-100 pt-4 text-sm">
              {recentFailures.map((f, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 text-zinc-600">
                  <span>
                    {f.kind === "audit" ? "Audit failed" : "Search failed"} — {f.label}
                  </span>
                  <span className="text-xs text-zinc-400">{new Date(f.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          <CardHeader>Pipeline</CardHeader>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {PIPELINE_STATUSES.map((status) => (
              <StatCard
                key={status}
                label={LEAD_STATUS_LABELS[status]}
                value={pipelineCounts[status] ?? 0}
                href={`/leads?status=${status}`}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>Audit activity</CardHeader>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-2">
            <StatCard label="Queued" value={queuedCount} href="/queue" />
            <StatCard label="Running" value={runningCount} href="/queue" />
          </div>
          <h3 className="mt-4 border-t border-zinc-100 pt-4 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Recently completed
          </h3>
          {recentAudits.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No production audits have completed yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {recentAudits.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3">
                  <Link href={`/leads/${a.businessId}`} className="text-zinc-800 hover:underline">
                    {a.businessName}
                  </Link>
                  <span className="text-xs text-zinc-400">
                    {a.status} · {new Date(a.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>Recent pipeline activity</CardHeader>
            {recentActivity.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No status changes have been recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {recentActivity.map((entry, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-x-3">
                    <Link href={`/leads/${entry.businessId}`} className="text-zinc-800 hover:underline">
                      {entry.businessName}
                    </Link>
                    <span className="text-xs text-zinc-400">
                      {entry.fromStatus ? LEAD_STATUS_LABELS[entry.fromStatus] : "—"} →{" "}
                      {LEAD_STATUS_LABELS[entry.toStatus]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>Recent searches</CardHeader>
            {recentSearchesTrimmed.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No production searches have been run yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {recentSearchesTrimmed.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3">
                    <Link href={`/searches/${s.id}`} className="text-zinc-800 hover:underline">
                      {s.niche} — {[s.city, s.state].filter(Boolean).join(", ")}
                    </Link>
                    <span className="text-xs text-zinc-400">{s.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

function QuickAction({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "flex min-h-[2.25rem] items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          : "flex min-h-[2.25rem] items-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      }
    >
      {label}
    </Link>
  );
}

function StatCard({
  label,
  value,
  href,
  warn = false,
}: {
  label: string;
  value: number;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block min-h-[3.5rem] rounded-md border p-3 hover:bg-zinc-50 ${warn && value > 0 ? "border-amber-300 bg-amber-50" : "border-zinc-200"}`}
    >
      <p className={`text-2xl font-semibold ${warn && value > 0 ? "text-amber-700" : "text-zinc-900"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </Link>
  );
}
