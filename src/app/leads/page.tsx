import Link from "next/link";

import { getFollowUpState, getTodayISODate } from "@/lib/pipeline/lead-profile";
import { LEAD_PRIORITIES, LEAD_PRIORITY_LABELS, LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/pipeline/pipeline-status";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { LeadPriority, LeadStatus } from "@/lib/supabase/database.types";

const PAGE_SIZE = 50;

type SortOption = "newest" | "oldest" | "status" | "priority" | "follow_up";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "status", label: "Pipeline status" },
  { value: "priority", label: "Priority" },
  { value: "follow_up", label: "Next follow-up" },
];

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;

function toArray(value: SearchParamValue): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function toSingle(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseStatusFilter(value: SearchParamValue): LeadStatus[] {
  const requested = new Set(toArray(value));
  return LEAD_STATUSES.filter((status) => requested.has(status));
}

function parsePriorityFilter(value: SearchParamValue): LeadPriority | null {
  const single = toSingle(value);
  return (LEAD_PRIORITIES as string[]).includes(single ?? "") ? (single as LeadPriority) : null;
}

function parseSourceFilter(value: SearchParamValue): "manual" | "google_places" | null {
  const single = toSingle(value);
  return single === "manual" || single === "google_places" ? single : null;
}

function parseSort(value: SearchParamValue): SortOption {
  const single = toSingle(value);
  const valid = SORT_OPTIONS.map((o) => o.value);
  return (valid as string[]).includes(single ?? "") ? (single as SortOption) : "newest";
}

function parsePage(value: SearchParamValue): number {
  const single = toSingle(value);
  const parsed = Number(single);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** Builds a /leads query string preserving current filters, overriding only the given keys. */
function buildHref(current: SearchParams, overrides: Record<string, string | string[] | null>): string {
  const params = new URLSearchParams();
  const merged: Record<string, SearchParamValue | null> = { ...current, ...overrides };

  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      params.append(key, v);
    }
  }

  const qs = params.toString();
  return qs ? `/leads?${qs}` : "/leads";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;

  const statusFilter = parseStatusFilter(rawParams.status);
  const priorityFilter = parsePriorityFilter(rawParams.priority);
  const sourceFilter = parseSourceFilter(rawParams.source);
  const overdueOnly = toSingle(rawParams.overdue) === "1";
  const searchText = (toSingle(rawParams.q) ?? "").trim();
  const sort = parseSort(rawParams.sort);
  const page = parsePage(rawParams.page);

  const supabase = createSupabaseServiceRoleClient();
  const today = getTodayISODate();

  // Text search and source filtering both live on `businesses`, not
  // `lead_profiles` — resolved as a narrowing id set first (matching
  // this project's established avoidance of PostgREST embedding).
  let narrowedBusinessIds: string[] | null = null;
  if (searchText || sourceFilter) {
    let businessQuery = supabase.from("businesses").select("id");
    if (searchText) businessQuery = businessQuery.ilike("name", `%${searchText}%`);
    if (sourceFilter) businessQuery = businessQuery.eq("source", sourceFilter);
    const { data: matched } = await businessQuery;
    narrowedBusinessIds = (matched ?? []).map((b) => b.id);
  }

  let rows: { business_id: string; status: LeadStatus; priority: LeadPriority | null; next_follow_up_date: string | null }[] = [];
  let totalCount = 0;

  if (narrowedBusinessIds === null || narrowedBusinessIds.length > 0) {
    let query = supabase
      .from("lead_profiles")
      .select("business_id, status, priority, next_follow_up_date", { count: "exact" });

    if (statusFilter.length > 0) query = query.in("status", statusFilter);
    if (priorityFilter) query = query.eq("priority", priorityFilter);
    if (overdueOnly) {
      query = query.lt("next_follow_up_date", today).not("status", "in", "(won,lost,not_a_fit)");
    }
    if (narrowedBusinessIds !== null) query = query.in("business_id", narrowedBusinessIds);

    // Sorting by status/priority text is alphabetical, not workflow
    // order — a known, documented simplification. A true custom
    // ordinal order would need a stored sort-order column, which is
    // out of scope for this phase (no additional schema changes).
    if (sort === "oldest") query = query.order("created_at", { ascending: true });
    else if (sort === "status") query = query.order("status", { ascending: true });
    else if (sort === "priority") query = query.order("priority", { ascending: false, nullsFirst: false });
    else if (sort === "follow_up") query = query.order("next_follow_up_date", { ascending: true, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });

    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
    rows = data ?? [];
    totalCount = count ?? 0;
  }

  const pageBusinessIds = rows.map((r) => r.business_id);

  const [{ data: businesses }, { data: websites }, { data: jobs }] = await Promise.all([
    supabase.from("businesses").select("id, name, city, state, source").in("id", pageBusinessIds),
    supabase
      .from("websites")
      .select("business_id, final_url, input_url, is_reachable")
      .in("business_id", pageBusinessIds),
    supabase
      .from("audit_jobs")
      .select("business_id, status, created_at")
      .in("business_id", pageBusinessIds)
      .order("created_at", { ascending: false }),
  ]);

  const businessById = new Map((businesses ?? []).map((b) => [b.id, b]));
  const websiteByBusiness = new Map((websites ?? []).map((w) => [w.business_id, w]));
  const latestJobByBusiness = new Map<string, NonNullable<typeof jobs>[number]>();
  for (const job of jobs ?? []) {
    if (!latestJobByBusiness.has(job.business_id)) latestJobByBusiness.set(job.business_id, job);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-5">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Leads</h1>
        </div>
        <Link href="/leads/new" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
          Add lead
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl px-8 py-10">
        <form method="get" className="mb-6 space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="q" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
                Search
              </label>
              <input
                id="q"
                name="q"
                type="text"
                defaultValue={searchText}
                placeholder="Business name"
                className="mt-1 w-48 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="priority" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                defaultValue={priorityFilter ?? ""}
                className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">Any</option>
                {LEAD_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {LEAD_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="source" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
                Source
              </label>
              <select
                id="source"
                name="source"
                defaultValue={sourceFilter ?? ""}
                className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">Any</option>
                <option value="manual">Manual</option>
                <option value="google_places">Google Places</option>
              </select>
            </div>

            <div>
              <label htmlFor="sort" className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
                Sort
              </label>
              <select
                id="sort"
                name="sort"
                defaultValue={sort}
                className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
              <input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} className="h-4 w-4" />
              Overdue follow-up only
            </label>

            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white"
            >
              Apply
            </button>
          </div>

          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">Status</legend>
            {LEAD_STATUSES.map((status) => (
              <label key={status} className="flex items-center gap-1.5 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  name="status"
                  value={status}
                  defaultChecked={statusFilter.includes(status)}
                  className="h-4 w-4"
                />
                {LEAD_STATUS_LABELS[status]}
              </label>
            ))}
          </fieldset>
        </form>

        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No leads match these filters.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-zinc-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + rows.length} of {totalCount}
            </p>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2">Business</th>
                    <th className="px-4 py-2">Source</th>
                    <th className="px-4 py-2">Website</th>
                    <th className="px-4 py-2">Reachable</th>
                    <th className="px-4 py-2">Job status</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Priority</th>
                    <th className="px-4 py-2">Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const business = businessById.get(row.business_id);
                    const website = websiteByBusiness.get(row.business_id);
                    const job = latestJobByBusiness.get(row.business_id);
                    const followUp = getFollowUpState(row.next_follow_up_date, row.status, today);

                    return (
                      <tr key={row.business_id} className="border-b border-zinc-100 last:border-0">
                        <td className="px-4 py-2">
                          <Link
                            href={`/leads/${row.business_id}`}
                            className="font-medium text-zinc-900 hover:underline"
                          >
                            {business?.name ?? "Unknown business"}
                          </Link>
                          <div className="text-xs text-zinc-400">
                            {[business?.city, business?.state].filter(Boolean).join(", ") || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-zinc-600">
                          {business?.source === "google_places" ? "Google Places" : "Manual"}
                        </td>
                        <td className="px-4 py-2 text-zinc-600">
                          {website?.final_url ?? website?.input_url ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-zinc-600">
                          {website ? (website.is_reachable ? "Yes" : website.is_reachable === false ? "No" : "Unknown") : "—"}
                        </td>
                        <td className="px-4 py-2 text-zinc-600">{job?.status ?? "—"}</td>
                        <td className="px-4 py-2 text-zinc-600">{LEAD_STATUS_LABELS[row.status]}</td>
                        <td className="px-4 py-2 text-zinc-600">
                          {row.priority ? LEAD_PRIORITY_LABELS[row.priority] : "—"}
                        </td>
                        <td className="px-4 py-2 text-zinc-600">
                          {row.next_follow_up_date ? (
                            <div>
                              <div>{row.next_follow_up_date}</div>
                              {followUp ? <FollowUpBadge state={followUp} /> : null}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={buildHref(rawParams, { page: String(page - 1) })}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={buildHref(rawParams, { page: String(page + 1) })}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function FollowUpBadge({ state }: { state: "overdue" | "due_today" | "upcoming" }) {
  if (state === "overdue") {
    return (
      <span className="mt-0.5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Overdue
      </span>
    );
  }
  if (state === "due_today") {
    return (
      <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        Due today
      </span>
    );
  }
  return null;
}
