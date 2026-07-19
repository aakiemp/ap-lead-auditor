import { Skeleton } from "@/components/ui";

export default function SearchesLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading searches…</span>
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-5 sm:px-8">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-28" />
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
        <Skeleton className="mb-6 h-16 w-full max-w-xs" />
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <Skeleton className="h-9 w-full rounded-none" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-t border-zinc-100 px-4 py-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="hidden h-4 w-16 sm:block" />
              <Skeleton className="hidden h-4 w-20 md:block" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
