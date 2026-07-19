import Link from "next/link";

import { Badge, Button, EmptyState, PageHeader, TestDataBadge } from "@/components/ui";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseTestDataFilter, TEST_DATA_FILTER_OPTIONS } from "@/lib/test-data/filter";

const PAGE_SIZE = 25;

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
  return qs ? `/searches?${qs}` : "/searches";
}

function statusVariant(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "partial") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

export default async function SearchesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;
  const testFilter = parseTestDataFilter(rawParams.testData);
  const page = parsePage(rawParams.page);

  const supabase = createSupabaseServiceRoleClient();

  let query = supabase
    .from("searches")
    .select("id, niche, city, state, businesses_found, businesses_imported, status, is_test, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (testFilter === "production") query = query.eq("is_test", false);
  else if (testFilter === "test_only") query = query.eq("is_test", true);

  const from = (page - 1) * PAGE_SIZE;
  const { data: searches, count } = await query.range(from, from + PAGE_SIZE - 1);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <PageHeader
        title="Searches"
        description={`${totalCount} search${totalCount === 1 ? "" : "es"} match the current filters.`}
        actions={
          <Link href="/searches/new" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
            New search
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
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

        {!searches || searches.length === 0 ? (
          <EmptyState
            title={testFilter === "test_only" ? "No test searches match this filter." : "No searches match this filter."}
            description={testFilter === "production" ? "Try including test data, or run a new search." : undefined}
            action={
              <Link href="/searches/new" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
                Run a search
              </Link>
            }
          />
        ) : (
          <>
            <p className="mb-2 text-xs text-zinc-500">
              Showing {from + 1}–{from + searches.length} of {totalCount}
            </p>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th scope="col" className="px-2 py-2 sm:px-4">
                      Niche
                    </th>
                    <th scope="col" className="hidden px-4 py-2 sm:table-cell">
                      Location
                    </th>
                    <th scope="col" className="hidden px-4 py-2 md:table-cell">
                      Found
                    </th>
                    <th scope="col" className="hidden px-4 py-2 md:table-cell">
                      Imported
                    </th>
                    <th scope="col" className="px-2 py-2 sm:px-4">
                      Status
                    </th>
                    <th scope="col" className="hidden px-4 py-2 lg:table-cell">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {searches.map((search) => (
                    <tr key={search.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-2 py-3 sm:px-4">
                        <Link href={`/searches/${search.id}`} className="font-medium text-zinc-900 hover:underline">
                          {search.niche}
                        </Link>
                        {search.is_test ? (
                          <span className="ml-2">
                            <TestDataBadge />
                          </span>
                        ) : null}
                        <div className="text-xs text-zinc-400 sm:hidden">
                          {[search.city, search.state].filter(Boolean).join(", ") || "—"}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-zinc-600 sm:table-cell">
                        {[search.city, search.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">{search.businesses_found}</td>
                      <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">{search.businesses_imported}</td>
                      <td className="px-2 py-3 sm:px-4">
                        <Badge variant={statusVariant(search.status)}>{search.status}</Badge>
                      </td>
                      <td className="hidden px-4 py-3 text-zinc-600 lg:table-cell">
                        {new Date(search.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={buildHref(rawParams, { page: String(page - 1) })}
                    aria-label="Previous page"
                    className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={buildHref(rawParams, { page: String(page + 1) })}
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
      </main>
    </div>
  );
}
