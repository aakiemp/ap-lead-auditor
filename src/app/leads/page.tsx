import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export default async function LeadsPage() {
  const supabase = createSupabaseServiceRoleClient();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, city, state, created_at")
    .order("created_at", { ascending: false });

  const businessIds = (businesses ?? []).map((business) => business.id);

  const [{ data: websites }, { data: jobs }] = await Promise.all([
    supabase
      .from("websites")
      .select("business_id, final_url, input_url, is_reachable, failure_reason")
      .in("business_id", businessIds),
    supabase
      .from("audit_jobs")
      .select("business_id, status, created_at")
      .in("business_id", businessIds)
      .order("created_at", { ascending: false }),
  ]);

  const websiteByBusiness = new Map((websites ?? []).map((website) => [website.business_id, website]));
  const latestJobByBusiness = new Map<string, NonNullable<typeof jobs>[number]>();
  for (const job of jobs ?? []) {
    if (!latestJobByBusiness.has(job.business_id)) {
      latestJobByBusiness.set(job.business_id, job);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-5">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Leads</h1>
        </div>
        <Link
          href="/leads/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Add lead
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl px-8 py-10">
        {!businesses || businesses.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No leads yet.{" "}
            <Link href="/leads/new" className="underline">
              Add one
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Business</th>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-4 py-2">Website</th>
                  <th className="px-4 py-2">Reachable</th>
                  <th className="px-4 py-2">Job status</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => {
                  const website = websiteByBusiness.get(business.id);
                  const job = latestJobByBusiness.get(business.id);
                  return (
                    <tr key={business.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-4 py-2">
                        <Link
                          href={`/leads/${business.id}`}
                          className="font-medium text-zinc-900 hover:underline"
                        >
                          {business.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-zinc-600">
                        {[business.city, business.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2 text-zinc-600">
                        {website?.final_url ?? website?.input_url ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-zinc-600">
                        {website ? (website.is_reachable ? "Yes" : "No") : "—"}
                      </td>
                      <td className="px-4 py-2 text-zinc-600">{job?.status ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
