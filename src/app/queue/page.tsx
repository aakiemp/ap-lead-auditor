import Link from "next/link";

import { isStaleAuditingJob } from "@/lib/audit/stale-job";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

import { QueueTable, type QueueJobRow } from "./queue-table";

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

export default async function QueuePage() {
  const supabase = createSupabaseServiceRoleClient();

  const { data: jobs } = await supabase
    .from("audit_jobs")
    .select("*")
    .eq("audit_depth", "basic")
    .order("created_at", { ascending: true });

  const businessIds = Array.from(new Set((jobs ?? []).map((j) => j.business_id)));
  const websiteIds = Array.from(new Set((jobs ?? []).map((j) => j.website_id)));

  const [{ data: businesses }, { data: websites }, { data: searchLinks }] = await Promise.all([
    supabase.from("businesses").select("id, name, source").in("id", businessIds),
    supabase.from("websites").select("id, input_url, final_url").in("id", websiteIds),
    supabase
      .from("search_businesses")
      .select("business_id, search_id, created_at")
      .in("business_id", businessIds)
      .order("created_at", { ascending: false }),
  ]);

  const searchIds = Array.from(new Set((searchLinks ?? []).map((link) => link.search_id)));
  const { data: searches } =
    searchIds.length > 0
      ? await supabase.from("searches").select("id, niche, city, state").in("id", searchIds)
      : { data: [] };

  const businessById = new Map((businesses ?? []).map((b) => [b.id, b]));
  const websiteById = new Map((websites ?? []).map((w) => [w.id, w]));
  const searchById = new Map((searches ?? []).map((s) => [s.id, s]));

  // search_businesses was fetched newest-first, so the first match per
  // business_id encountered here is the most recently linked search.
  const latestSearchIdByBusiness = new Map<string, string>();
  for (const link of searchLinks ?? []) {
    if (!latestSearchIdByBusiness.has(link.business_id)) {
      latestSearchIdByBusiness.set(link.business_id, link.search_id);
    }
  }

  const rows: QueueJobRow[] = (jobs ?? []).map((job) => {
    const business = businessById.get(job.business_id);
    const website = websiteById.get(job.website_id);
    const searchId = latestSearchIdByBusiness.get(job.business_id);
    const search = searchId ? searchById.get(searchId) : undefined;

    const isStale = isStaleAuditingJob(job.status, job.claimed_at, STALE_THRESHOLD_MS);

    return {
      id: job.id,
      businessId: job.business_id,
      businessName: business?.name ?? "Unknown business",
      websiteUrl: website?.final_url ?? website?.input_url ?? null,
      source: business?.source ?? "manual",
      searchLabel: search ? `${search.niche} — ${[search.city, search.state].filter(Boolean).join(", ")}` : null,
      status: job.status,
      attempt: job.attempt,
      createdAt: job.created_at,
      claimedAt: job.claimed_at,
      errorMessage: job.error_message,
      isStale,
    };
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">Audit queue</h1>
        <p className="mt-1 text-sm text-zinc-500">Basic audit jobs — manual batch execution only.</p>
      </header>

      <main className="mx-auto w-full max-w-5xl px-8 py-10">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No basic audit jobs exist yet.</p>
        ) : (
          <QueueTable jobs={rows} />
        )}
      </main>
    </div>
  );
}
