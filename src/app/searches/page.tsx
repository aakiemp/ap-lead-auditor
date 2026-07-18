import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export default async function SearchesPage() {
  const supabase = createSupabaseServiceRoleClient();

  const { data: searches } = await supabase
    .from("searches")
    .select("id, niche, city, state, businesses_found, businesses_imported, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-5">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Searches</h1>
        </div>
        <Link
          href="/searches/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          New search
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl px-8 py-10">
        {!searches || searches.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No searches yet.{" "}
            <Link href="/searches/new" className="underline">
              Run one
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Niche</th>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-4 py-2">Found</th>
                  <th className="px-4 py-2">Imported</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {searches.map((search) => (
                  <tr key={search.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/searches/${search.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {search.niche}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-zinc-600">
                      {[search.city, search.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-600">{search.businesses_found}</td>
                    <td className="px-4 py-2 text-zinc-600">{search.businesses_imported}</td>
                    <td className="px-4 py-2 text-zinc-600">{search.status}</td>
                    <td className="px-4 py-2 text-zinc-600">
                      {new Date(search.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
