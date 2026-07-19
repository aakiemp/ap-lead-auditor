import { Skeleton } from "@/components/ui";

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      <Skeleton className="h-4 w-28" />
      <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <Skeleton className="h-9 w-full rounded-none" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-zinc-100 px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QueueLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading audit queue…</span>
      <header className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-64" />
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-8">
        <Skeleton className="h-16 w-full max-w-xs" />
        <SectionSkeleton rows={2} />
        <SectionSkeleton rows={1} />
        <SectionSkeleton rows={3} />
      </main>
    </div>
  );
}
