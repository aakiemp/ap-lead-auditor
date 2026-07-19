import { Skeleton } from "@/components/ui";

export default function LeadsLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading leads…</span>
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-5 sm:px-8">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-24" />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8">
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-32" />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <Skeleton className="h-9 w-full rounded-none" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-t border-zinc-100 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="hidden h-4 w-20 sm:block" />
              <Skeleton className="hidden h-4 w-24 md:block" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
