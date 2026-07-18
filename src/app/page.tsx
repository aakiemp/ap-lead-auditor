import Link from "next/link";

const PHASES = [
  { label: "Phase 1 — Project scaffold", status: "done" },
  { label: "Phase 2 — Core database schema", status: "done" },
  { label: "Phase 3 — Manual URL submission + normalization", status: "current" },
  { label: "Phase 4 — PageSpeed integration + findings/scoring", status: "upcoming" },
  { label: "Phase 5 — Copy-to-AI summary", status: "upcoming" },
] as const;

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <h1 className="text-lg font-semibold tracking-tight">
          AP Webmaster — Lead Auditor
        </h1>
        <p className="text-sm text-zinc-500">Internal lead research and website audit tool</p>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-8 py-12">
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-medium text-zinc-900">Status</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Phase 3: manual single-website intake, URL normalization, and an
            SSRF-guarded reachability check are implemented. No PageSpeed,
            findings, or scoring yet.
          </p>

          <div className="mt-4 flex gap-3">
            <Link
              href="/leads"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              View leads
            </Link>
            <Link
              href="/leads/new"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Add a lead
            </Link>
          </div>

          <ul className="mt-6 space-y-2">
            {PHASES.map((phase) => (
              <li
                key={phase.label}
                className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm"
              >
                <span className="text-zinc-700">{phase.label}</span>
                <span
                  className={
                    phase.status === "current"
                      ? "rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white"
                      : phase.status === "done"
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500"
                  }
                >
                  {phase.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
