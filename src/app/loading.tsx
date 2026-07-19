import { Card, Skeleton } from "@/components/ui";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading dashboard…</span>
      <header className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-36" />
          ))}
        </div>

        <Card>
          <Skeleton className="h-4 w-20" />
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </Card>

        <Card>
          <Skeleton className="h-4 w-20" />
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </Card>

        <Card>
          <Skeleton className="h-4 w-32" />
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <Skeleton className="h-4 w-40" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5" />
              ))}
            </div>
          </Card>
          <Card>
            <Skeleton className="h-4 w-32" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5" />
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
