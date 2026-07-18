"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { progressStageLabel } from "@/lib/audit/audit-progress";
import { DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE } from "@/lib/validation/queue-batch";
import type { AuditJobStatus, AuditProgressStage } from "@/lib/supabase/database.types";

import { retryJobAction, runSelectedAuditsAction, type RetryJobState, type RunBatchState } from "./actions";
import { getAuditProgressAction, resolveNextBatchJobIdsAction, type JobProgressRow } from "./progress-actions";

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set<AuditJobStatus>(["completed", "partial", "failed"]);

export interface QueueJobRow {
  id: string;
  businessId: string;
  businessName: string;
  websiteUrl: string | null;
  source: string;
  searchLabel: string | null;
  status: AuditJobStatus;
  progressStage: AuditProgressStage | null;
  progressUpdatedAt: string | null;
  attempt: number;
  createdAt: string;
  claimedAt: string | null;
  errorMessage: string | null;
  isStale: boolean;
}

const RUN_BATCH_INITIAL: RunBatchState = { error: null, summary: null };
const RETRY_INITIAL: RetryJobState = { error: null, status: null };

function formatRelativeTime(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `Updated ${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.round(seconds / 60);
  return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

export function QueueTable({ jobs }: { jobs: QueueJobRow[] }) {
  const [selectedState, selectedAction, selectedPending] = useActionState(
    runSelectedAuditsAction,
    RUN_BATCH_INITIAL,
  );
  const [retryState, retryFormAction, retryPending] = useActionState(retryJobAction, RETRY_INITIAL);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState(String(DEFAULT_BATCH_SIZE));
  const [resolvingNextBatch, setResolvingNextBatch] = useState(false);
  const [nextBatchError, setNextBatchError] = useState<string | null>(null);

  // The exact job ids the currently-in-flight (or just-finished)
  // action is tracking. Polling is scoped to exactly this list — never
  // "all currently auditing jobs" system-wide — so an unrelated job
  // running elsewhere can never affect this batch's progress math.
  const [trackedJobIds, setTrackedJobIds] = useState<string[]>([]);
  const [progressById, setProgressById] = useState<Record<string, JobProgressRow>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const anyPending = selectedPending || retryPending || resolvingNextBatch;

  // Self-scheduling setTimeout (not setInterval) so a slow poll can
  // never overlap the next one. Polls immediately when trackedJobIds
  // changes, then every POLL_INTERVAL_MS, and stops entirely once
  // every tracked job has reached a terminal status.
  useEffect(() => {
    if (trackedJobIds.length === 0) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const result = await getAuditProgressAction(trackedJobIds);
      if (cancelled) return;

      if (result.ok) {
        setProgressById((prev) => {
          const next = { ...prev };
          for (const row of result.rows) next[row.id] = row;
          return next;
        });
        setNowMs(Date.now());

        // Each poll returns fresh, complete status for every tracked
        // id (never a delta), so this poll's own rows are sufficient
        // to decide whether to keep going — no need to reference
        // accumulated state across polls here.
        const byId = new Map(result.rows.map((row) => [row.id, row]));
        const allTerminal = trackedJobIds.every((id) => {
          const status = byId.get(id)?.status;
          return status !== undefined && TERMINAL_STATUSES.has(status);
        });
        if (allTerminal) return; // stop polling — nothing left to watch
      }
      // On failure, retain the last known state and simply try again
      // next tick — never cancel or affect the audit itself.

      timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [trackedJobIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRunNextBatch() {
    setNextBatchError(null);
    setResolvingNextBatch(true);
    const size = Number(batchSize) || DEFAULT_BATCH_SIZE;
    const result = await resolveNextBatchJobIdsAction(size);
    setResolvingNextBatch(false);

    if (result.jobIds.length === 0) {
      setNextBatchError(result.error ?? "No queued jobs are available to run.");
      return;
    }

    setTrackedJobIds(result.jobIds);
    setProgressById({});
    const formData = new FormData();
    for (const id of result.jobIds) formData.append("jobId", id);
    selectedAction(formData);
  }

  function mergedRow(job: QueueJobRow): QueueJobRow {
    const polled = progressById[job.id];
    if (!polled) return job;
    return {
      ...job,
      status: polled.status,
      progressStage: polled.progressStage,
      progressUpdatedAt: polled.progressUpdatedAt,
    };
  }

  const mergedJobs = jobs.map(mergedRow);

  const queued = mergedJobs.filter((j) => j.status === "queued" || j.status === "pending");
  const running = mergedJobs.filter((j) => j.status === "auditing");
  const completed = mergedJobs.filter((j) => j.status === "completed");
  const partial = mergedJobs.filter((j) => j.status === "partial");
  const failed = mergedJobs.filter((j) => j.status === "failed");

  const summary = selectedState.summary;
  const actionError = selectedState.error ?? retryState.error ?? nextBatchError;

  return (
    <div className="space-y-8">
      {actionError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      ) : null}

      {trackedJobIds.length > 0 ? (
        <BatchProgressBar trackedJobIds={trackedJobIds} progressById={progressById} />
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
          <form
            action={selectedAction}
            onSubmit={() => {
              setTrackedJobIds(Array.from(selected));
              setProgressById({});
            }}
            className="mt-3 space-y-3"
          >
            <JobTable jobs={queued} nowMs={nowMs} selectable selected={selected} onToggle={toggle} disabled={anyPending} />
            <button
              type="submit"
              disabled={anyPending || selected.size === 0}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {selectedPending ? "Running…" : `Run selected (${selected.size})`}
            </button>
          </form>
        )}

        <div className="mt-4 flex items-center gap-3 border-t border-zinc-100 pt-4">
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
            type="button"
            onClick={handleRunNextBatch}
            disabled={anyPending}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50"
          >
            {resolvingNextBatch ? "Resolving next batch…" : selectedPending ? "Running…" : "Run next batch"}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-900">Running ({running.length})</h2>
        <JobTable jobs={running} nowMs={nowMs} />
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-900">Partial ({partial.length})</h2>
        <JobTable
          jobs={partial}
          nowMs={nowMs}
          retryFormAction={retryFormAction}
          disabled={anyPending}
          onRetrySubmit={(id) => {
            setTrackedJobIds([id]);
            setProgressById({});
          }}
        />
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-900">Failed ({failed.length})</h2>
        <JobTable
          jobs={failed}
          nowMs={nowMs}
          retryFormAction={retryFormAction}
          disabled={anyPending}
          onRetrySubmit={(id) => {
            setTrackedJobIds([id]);
            setProgressById({});
          }}
        />
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-900">Completed ({completed.length})</h2>
        <JobTable jobs={completed} nowMs={nowMs} />
      </section>
    </div>
  );
}

function BatchProgressBar({
  trackedJobIds,
  progressById,
}: {
  trackedJobIds: string[];
  progressById: Record<string, JobProgressRow>;
}) {
  const total = trackedJobIds.length;
  let finished = 0;
  let running = 0;
  let waiting = 0;

  for (const id of trackedJobIds) {
    const status = progressById[id]?.status;
    if (status && TERMINAL_STATUSES.has(status)) finished++;
    else if (status === "auditing") running++;
    else waiting++; // includes queued/pending and "not yet polled"
  }

  const percent = total > 0 ? Math.round((finished / total) * 100) : 0;

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-zinc-900 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-zinc-600">
        {finished} of {total} audit{total === 1 ? "" : "s"} finished — {running} running, {waiting} waiting
      </p>
    </div>
  );
}

function JobTable({
  jobs,
  nowMs,
  selectable = false,
  selected,
  onToggle,
  retryFormAction,
  onRetrySubmit,
  disabled = false,
}: {
  jobs: QueueJobRow[];
  nowMs: number;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  retryFormAction?: (formData: FormData) => void;
  onRetrySubmit?: (jobId: string) => void;
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
                <div>{progressStageLabel(job.status, job.progressStage)}</div>
                {job.progressUpdatedAt && job.status === "auditing" ? (
                  <div className="text-xs text-zinc-400">{formatRelativeTime(job.progressUpdatedAt, nowMs)}</div>
                ) : null}
                {job.isStale ? (
                  <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Possibly stale
                  </span>
                ) : null}
                {job.errorMessage ? (
                  <span className="mt-1 block text-xs text-red-600">{job.errorMessage}</span>
                ) : null}
              </td>
              {retryFormAction ? (
                <td className="px-4 py-2">
                  <form action={retryFormAction} onSubmit={() => onRetrySubmit?.(job.id)}>
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
