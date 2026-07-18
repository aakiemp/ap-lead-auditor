"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE } from "@/lib/validation/queue-batch";

import {
  retryJobAction,
  runNextBatchAction,
  runSelectedAuditsAction,
  type RetryJobState,
  type RunBatchState,
} from "./actions";

export interface QueueJobRow {
  id: string;
  businessId: string;
  businessName: string;
  websiteUrl: string | null;
  source: string;
  searchLabel: string | null;
  status: "pending" | "queued" | "discovering" | "auditing" | "completed" | "partial" | "failed" | "skipped";
  attempt: number;
  createdAt: string;
  claimedAt: string | null;
  errorMessage: string | null;
  isStale: boolean;
}

const RUN_BATCH_INITIAL: RunBatchState = { error: null, summary: null };
const RETRY_INITIAL: RetryJobState = { error: null, status: null };

export function QueueTable({ jobs }: { jobs: QueueJobRow[] }) {
  const [selectedState, selectedAction, selectedPending] = useActionState(
    runSelectedAuditsAction,
    RUN_BATCH_INITIAL,
  );
  const [nextBatchState, nextBatchAction, nextBatchPending] = useActionState(
    runNextBatchAction,
    RUN_BATCH_INITIAL,
  );
  const [retryState, retryFormAction, retryPending] = useActionState(retryJobAction, RETRY_INITIAL);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState(String(DEFAULT_BATCH_SIZE));

  const anyPending = selectedPending || nextBatchPending || retryPending;

  const queued = jobs.filter((j) => j.status === "queued" || j.status === "pending");
  const running = jobs.filter((j) => j.status === "auditing");
  const completed = jobs.filter((j) => j.status === "completed");
  const partial = jobs.filter((j) => j.status === "partial");
  const failed = jobs.filter((j) => j.status === "failed");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const summary = selectedState.summary ?? nextBatchState.summary;
  const actionError = selectedState.error ?? nextBatchState.error ?? retryState.error;

  return (
    <div className="space-y-8">
      {actionError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      ) : null}
      {summary ? (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Selected {summary.selected} · Claimed {summary.claimed} · Completed {summary.completed} · Partial{" "}
          {summary.partial} · Failed {summary.failed} · Skipped {summary.skipped}
        </div>
      ) : null}
      {anyPending ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Running audits — this may take several minutes. It is not safe to assume closing this tab
          won&apos;t interrupt anything in progress.
        </p>
      ) : null}

      <section>
        <h2 className="text-sm font-medium text-zinc-900">Queued ({queued.length})</h2>
        {queued.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No queued jobs.</p>
        ) : (
          <form action={selectedAction} className="mt-3 space-y-3">
            <JobTable jobs={queued} selectable selected={selected} onToggle={toggle} disabled={anyPending} />
            <button
              type="submit"
              disabled={anyPending || selected.size === 0}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {selectedPending ? "Running…" : `Run selected (${selected.size})`}
            </button>
          </form>
        )}

        <form action={nextBatchAction} className="mt-4 flex items-center gap-3 border-t border-zinc-100 pt-4">
          <label className="text-sm text-zinc-700">
            Batch size
            <input
              type="number"
              name="batchSize"
              min={1}
              max={MAX_BATCH_SIZE}
              value={batchSize}
              disabled={anyPending}
              onChange={(e) => setBatchSize(e.target.value)}
              className="ml-2 w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50"
            />
          </label>
          <button
            type="submit"
            disabled={anyPending}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50"
          >
            {nextBatchPending ? "Running…" : "Run next batch"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-900">Running ({running.length})</h2>
        <JobTable jobs={running} />
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-900">Partial ({partial.length})</h2>
        <JobTable jobs={partial} retryFormAction={retryFormAction} disabled={anyPending} />
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-900">Failed ({failed.length})</h2>
        <JobTable jobs={failed} retryFormAction={retryFormAction} disabled={anyPending} />
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-900">Completed ({completed.length})</h2>
        <JobTable jobs={completed} />
      </section>
    </div>
  );
}

function JobTable({
  jobs,
  selectable = false,
  selected,
  onToggle,
  retryFormAction,
  disabled = false,
}: {
  jobs: QueueJobRow[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  retryFormAction?: (formData: FormData) => void;
  disabled?: boolean;
}) {
  if (jobs.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500">None.</p>;
  }

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            {selectable ? <th className="px-4 py-2" /> : null}
            <th className="px-4 py-2">Business</th>
            <th className="px-4 py-2">Website</th>
            <th className="px-4 py-2">Source / search</th>
            <th className="px-4 py-2">Queued</th>
            <th className="px-4 py-2">Last attempt</th>
            <th className="px-4 py-2">Attempt #</th>
            <th className="px-4 py-2">Status</th>
            {retryFormAction ? <th className="px-4 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-zinc-100 last:border-0">
              {selectable ? (
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    name="jobId"
                    value={job.id}
                    checked={selected?.has(job.id) ?? false}
                    onChange={() => onToggle?.(job.id)}
                    disabled={disabled}
                    className="h-4 w-4"
                  />
                </td>
              ) : null}
              <td className="px-4 py-2">
                <Link href={`/leads/${job.businessId}`} className="font-medium text-zinc-900 hover:underline">
                  {job.businessName}
                </Link>
              </td>
              <td className="px-4 py-2 text-zinc-600">{job.websiteUrl ?? "—"}</td>
              <td className="px-4 py-2 text-zinc-600">
                {job.source === "google_places" ? (job.searchLabel ?? "Google Places") : "Manual"}
              </td>
              <td className="px-4 py-2 text-zinc-600">{new Date(job.createdAt).toLocaleString()}</td>
              <td className="px-4 py-2 text-zinc-600">
                {job.claimedAt ? new Date(job.claimedAt).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-2 text-zinc-600">{job.attempt}</td>
              <td className="px-4 py-2 text-zinc-600">
                {job.status}
                {job.isStale ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Possibly stale
                  </span>
                ) : null}
                {job.errorMessage ? (
                  <span className="mt-1 block text-xs text-red-600">{job.errorMessage}</span>
                ) : null}
              </td>
              {retryFormAction ? (
                <td className="px-4 py-2">
                  <form action={retryFormAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <button
                      type="submit"
                      disabled={disabled}
                      className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 disabled:opacity-50"
                    >
                      Retry
                    </button>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
