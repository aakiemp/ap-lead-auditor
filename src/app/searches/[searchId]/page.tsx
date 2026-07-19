import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState, TestDataBadge } from "@/components/ui";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { AuditJobStatus } from "@/lib/supabase/database.types";

import { QueueSelectedForm, type QueueableBusinessRow } from "./queue-selected-form";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_BASIC_JOB_STATUSES: AuditJobStatus[] = ["pending", "queued", "auditing"];

export default async function SearchResultsPage({
  params,
}: {
  params: Promise<{ searchId: string }>;
}) {
  const { searchId } = await params;

  if (!UUID_PATTERN.test(searchId)) {
    notFound();
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data: search } = await supabase
    .from("searches")
    .select("*")
    .eq("id", searchId)
    .maybeSingle();

  if (!search) {
    notFound();
  }

  const { data: links } = await supabase
    .from("search_businesses")
    .select("business_id, rank_in_search, is_new_business, duplicate_warning")
    .eq("search_id", searchId)
    .order("rank_in_search", { ascending: true });

  const businessIds = (links ?? []).map((link) => link.business_id);

  const [{ data: businesses }, { data: websites }, { data: jobs }] = await Promise.all([
    supabase.from("businesses").select("*").in("id", businessIds),
    supabase.from("websites").select("id, business_id").in("business_id", businessIds),
    supabase
      .from("audit_jobs")
      .select("business_id, status")
      .in("business_id", businessIds)
      .eq("audit_depth", "basic")
      .in("status", ACTIVE_BASIC_JOB_STATUSES),
  ]);

  const businessById = new Map((businesses ?? []).map((b) => [b.id, b]));
  const websiteBusinessIds = new Set((websites ?? []).map((w) => w.business_id));
  const queuedBusinessIds = new Set((jobs ?? []).map((j) => j.business_id));

  const rows: QueueableBusinessRow[] = (links ?? [])
    .map((link) => {
      const business = businessById.get(link.business_id);
      if (!business) return null;
      return {
        id: business.id,
        name: business.name,
        category: business.primary_category,
        city: business.city,
        state: business.state,
        rating: business.google_rating,
        reviewCount: business.google_review_count,
        hasWebsite: websiteBusinessIds.has(business.id),
        alreadyQueued: queuedBusinessIds.has(business.id),
        duplicateWarning: link.duplicate_warning,
        isNew: link.is_new_business,
      };
    })
    .filter((row): row is QueueableBusinessRow => row !== null);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
          <Link href="/searches" className="hover:text-zinc-700">
            Searches
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-zinc-700">{search.niche}</span>
        </nav>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">
          {search.niche} — {[search.city, search.state].filter(Boolean).join(", ")}
          {search.is_test ? (
            <span className="ml-2 align-middle">
              <TestDataBadge />
            </span>
          ) : null}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Status: {search.status} · Found {search.businesses_found} · Imported{" "}
          {search.businesses_imported} · Filtered {search.businesses_filtered} · No website{" "}
          {search.businesses_without_website}
        </p>
        {search.error_message ? (
          <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {search.error_message}
          </p>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8">
        {rows.length === 0 ? (
          <EmptyState
            title="No businesses were imported for this search."
            description="This can happen when a search found no matching results, or every result was filtered out."
          />
        ) : (
          <QueueSelectedForm searchId={searchId} businesses={rows} />
        )}
      </main>
    </div>
  );
}
