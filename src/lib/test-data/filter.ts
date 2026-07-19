/**
 * Shared three-way test-data visibility filter, used identically on
 * every production list page (dashboard, /leads, /queue, /searches).
 * Only `businesses` and `searches` carry `is_test` directly (Phase 12
 * migration) -- every other table (websites, audit_jobs, audits,
 * audit_findings, audit_scores, screenshots, search_businesses,
 * lead_profiles, lead_activity) derives test status through its
 * existing business_id/search_id foreign key, never its own column.
 */
export type TestDataFilter = "production" | "include" | "test_only";

export const TEST_DATA_FILTER_DEFAULT: TestDataFilter = "production";

export const TEST_DATA_FILTER_OPTIONS: { value: TestDataFilter; label: string }[] = [
  { value: "production", label: "Production only" },
  { value: "include", label: "Include test data" },
  { value: "test_only", label: "Test data only" },
];

export function parseTestDataFilter(value: string | string[] | undefined): TestDataFilter {
  const single = Array.isArray(value) ? value[0] : value;
  if (single === "include" || single === "test_only") return single;
  return TEST_DATA_FILTER_DEFAULT;
}

/**
 * For tables that only relate to test status via business_id (no
 * is_test column of their own): given the id of every business known
 * to be test data, decides whether a given business_id survives the
 * current filter. Used to filter an already-fetched row set in JS,
 * since PostgREST can't express "join back to businesses and check
 * is_test" without embedding, which this project deliberately avoids.
 */
export function businessIdMatchesFilter(
  businessId: string,
  testBusinessIds: ReadonlySet<string>,
  filter: TestDataFilter,
): boolean {
  const isTest = testBusinessIds.has(businessId);
  if (filter === "production") return !isTest;
  if (filter === "test_only") return isTest;
  return true;
}

/**
 * Resolves the current filter into an explicit business-id allowlist
 * for a server-side `.in('business_id', ...)` clause, given an
 * already-fetched set of businesses (id + is_test). Returns null for
 * "include" (no filtering needed -- do not add an .in() clause at
 * all). Only ever produces an .in() allowlist, never a `.not(...'in'...)`
 * exclusion clause, matching this project's established avoidance of
 * that less-predictable PostgREST form. An empty (non-null) array is a
 * valid result -- callers must treat it as "zero matching rows",
 * skipping the query rather than calling `.in()` with an empty array.
 */
export function testFilteredBusinessIds(
  businesses: readonly { id: string; is_test: boolean }[],
  filter: TestDataFilter,
): string[] | null {
  if (filter === "include") return null;
  if (filter === "test_only") return businesses.filter((b) => b.is_test).map((b) => b.id);
  return businesses.filter((b) => !b.is_test).map((b) => b.id);
}
