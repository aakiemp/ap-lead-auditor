import Link from "next/link";

import { Button, EmptyState, PageHeader, TestDataBadge } from "@/components/ui";
import { isStaleAuditingJob } from "@/lib/audit/stale-job";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseTestDataFilter, TEST_DATA_FILTER_OPTIONS, testFilteredBusinessIds } from "@/lib/test-data/filter";
import type { AuditJob, AuditJobStatus } from "@/lib/supabase/database.types";

import { QueueTable, type QueueJobRow } from "./queue-table";

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

// Queued/pending/auditing/partial/failed are the operationally "live"
// statuses -- the operator needs to see the FULL set to select a batch
// (paginating this away would silently hide jobs from selection), so
// this is a defensive cap, not true pagination. In practice this set
// stays small: jobs move out of these statuses as they run or get
// retried. Completed jobs are pure historical record with no operator
// action needed on them, so that section is the one that's genuinely,
// safely paginated below.
const ACTIVE_STATUSES: AuditJobStatus[] = ["queued", "pending", "auditing", "partial", "failed"];
const ACTIVE_CAP = 200;
const COMPLETED_PAGE_SIZE = 25;

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;

function toSingle(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: SearchParamValue): number {
  const single = toSingle(value);
  const parsed = Number(single);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildHref(current: SearchParams, overrides: Record<string, string | null>): string {
  const params = new URLSearchParams();
  const merged: Record<string, SearchParamValue | null> = { ...current, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  const qs = params.toString();
  return qs ? `/queue?${qs}` : "/queue";
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;
  const testFilter = parseTestDataFilter(rawParams.testData);
  const completedPage = parsePage(rawParams.completedPage);

  const supabase = createSupabaseServiceRoleClient();

  // Resolved once and reused for every downstream filter below --
  // audit_jobs has no is_test column of its own (see CLAUDE.md
  // "Roadmap" / Phase 12): test status is always derived from the
  // owning business. This also doubles as the business name/source
  // lookup the table rows need, so it isn't purely a count-support
  // fetch.
  const { data: allBusinesses } = await supabase.from("businesses").select("id, name, source, is_test");
  const businessById = new Map((allBusinesses ?? []).map((b) => [b.id, b]));
  const filterIds = testFilteredBusinessIds(allBusinesses ?? [], testFilter);

  let activeJobs: AuditJob[] = [];
  if (filterIds === null || filterIds.length > 0) {
    let activeQuery = supabase
      .from("audit_jobs")
      .select("*")
      .eq("audit_depth", "basic")
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: true })
      .limit(ACTIVE_CAP);
    if (filterIds !== null) activeQuery = activeQuery.in("business_id", filterIds);
    const { data } = await activeQuery;
    activeJobs = data ?? [];
  }

  let completedJobsRaw: AuditJob[] = [];
  let completedCount = 0;
  if (filterIds === null || filterIds.length > 0) {
    let completedQuery = supabase
      .from("audit_jobs")
      .select("*", { count: "exact" })
      .eq("audit_depth", "basic")
      .eq("status", "completed")
      .order("created_at", { ascending: false });
    if (filterIds !== null) completedQuery = completedQuery.in("business_id", filterIds);
    const from = (completedPage - 1) * COMPLETED_PAGE_SIZE;
    const { data, count } = await completedQuery.range(from, from + COMPLETED_PAGE_SIZE - 1);
    completedJobsRaw = data ?? [];
    completedCount = count ?? 0;
  }

  const allJobs = [...activeJobs, ...completedJobsRaw];
  const businessIds = Array.from(new Set(allJobs.map((j) => j.business_id)));
  const websiteIds = Array.from(new Set(allJobs.map((j) => j.website_id)));

  const { data: websites } = await supabase
    .from("websites")
    .select("id, input_url, final_url")
    .in("id", websiteIds.length > 0 ? websiteIds : ["00000000-0000-0000-0000-000000000000"]);
  const websiteById = new Map((websites ?? []).map((w) => [w.id, w]));

  const { data: searchLinks } = await supabase
    .from("search_businesses")
    .select("business_id, search_id, created_at")
    .in("business_id", businessIds.length > 0 ? businessIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const searchIds = Array.from(new Set((searchLinks ?? []).map((link) => link.search_id)));
  const { data: searches } =
    searchIds.length > 0
      ? await supabase.from("searches").select("id, niche, city, state").in("id", searchIds)
      : { data: [] };

  const searchById = new Map((searches ?? []).map((s) => [s.id, s]));

  // search_businesses was fetched newest-first, so the first match per
  // business_id encountered here is the most recently linked search.
  const latestSearchIdByBusiness = new Map<string, string>();
  for (const link of searchLinks ?? []) {
    if (!latestSearchIdByBusiness.has(link.business_id)) {
      latestSearchIdByBusiness.set(link.business_id, link.search_id);
    }
  }

  function toRow(job: AuditJob): QueueJobRow {
    const business = businessById.get(job.business_id);
    const website = websiteById.get(job.website_id);
    const searchId = latestSearchIdByBusiness.get(job.business_id);
    const search = searchId ? searchById.get(searchId) : undefined;
    const isStale = isStaleAuditingJob(job.status, job.claimed_at, STALE_THRESHOLD_MS);

    return {
      id: job.id,
      businessId: job.business_id,
      businessName: business?.name ?? "Unknown business",
      isTest: business?.is_test ?? false,
      websiteUrl: website?.final_url ?? website?.input_url ?? null,
      source: business?.source ?? "manual",
      searchLabel: search ? `${search.niche} — ${[search.city, search.state].filter(Boolean).join(", ")}` : null,
      status: job.status,
      progressStage: job.progress_stage,
      progressUpdatedAt: job.progress_updated_at,
      attempt: job.attempt,
      createdAt: job.created_at,
      claimedAt: job.claimed_at,
      errorMessage: job.error_message,
      isStale,
    };
  }

  const activeRows = activeJobs.map(toRow);
  const completedRows = completedJobsRaw.map(toRow);
  const totalCompletedPages = Math.max(1, Math.ceil(completedCount / COMPLETED_PAGE_SIZE));

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <PageHeader title="Audit queue" description="Basic audit jobs — manual batch execution only." />

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8">
        <form method="get" className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div>
            <label htmlFor="testData" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Test data
            </label>
            <select
              id="testData"
              name="testData"
              defaultValue={testFilter}
              className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              {TEST_DATA_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary">
            Apply
          </Button>
        </form>

        {activeRows.length === 0 && completedRows.length === 0 ? (
          <EmptyState
            title={testFilter === "test_only" ? "No test audit jobs match this filter." : "No basic audit jobs match this filter."}
            description={
              testFilter === "production"
                ? "Try including test data, or queue a lead for a basic audit from its lead page."
                : undefined
            }
          />
        ) : (
          <QueueTable jobs={activeRows} />
        )}

        <section className="mt-8">
          <h2 className="text-sm font-medium text-zinc-900">Completed ({completedCount})</h2>
          {completedRows.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              {testFilter === "production" ? "No production audits have completed yet." : "None."}
            </p>
          ) : (
            <>
              <CompletedTable jobs={completedRows} />
              <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
                <span className="text-zinc-500">
                  Page {completedPage} of {totalCompletedPages}
                </span>
                <div className="flex gap-2">
                  {completedPage > 1 ? (
                    <Link
                      href={buildHref(rawParams, { completedPage: String(completedPage - 1) })}
                      aria-label="Previous page"
                      className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Previous
                    </Link>
                  ) : null}
                  {completedPage < totalCompletedPages ? (
                    <Link
                      href={buildHref(rawParams, { completedPage: String(completedPage + 1) })}
                      aria-label="Next page"
                      className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Next
                    </Link>
                  ) : null}
                </div>
              </nav>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function CompletedTable({ jobs }: { jobs: QueueJobRow[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th scope="col" className="px-2 py-2 sm:px-4">
              Business
            </th>
            <th scope="col" className="hidden px-4 py-2 md:table-cell">
              Source / search
            </th>
            <th scope="col" className="px-2 py-2 sm:px-4">
              Completed
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-zinc-100 last:border-0">
              <td className="px-2 py-3 sm:px-4">
                <Link href={`/leads/${job.businessId}`} className="font-medium text-zinc-900 hover:underline">
                  {job.businessName}
                </Link>
                {job.isTest ? (
                  <span className="ml-2">
                    <TestDataBadge />
                  </span>
                ) : null}
                <div className="text-xs text-zinc-400 md:hidden">
                  {job.source === "google_places" ? (job.searchLabel ?? "Google Places") : "Manual"}
                </div>
              </td>
              <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">
                {job.source === "google_places" ? (job.searchLabel ?? "Google Places") : "Manual"}
              </td>
              <td className="px-2 py-3 text-zinc-600 sm:px-4">{new Date(job.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
