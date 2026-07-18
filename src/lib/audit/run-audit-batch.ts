import "server-only";

import { runAudit } from "@/lib/audit/run-audit";

const CONCURRENCY = 2;

export interface BatchSummary {
  selected: number;
  claimed: number;
  completed: number;
  partial: number;
  failed: number;
  skipped: number;
}

/**
 * Runs a bounded-concurrency batch of existing basic audit jobs,
 * reusing runAudit() unchanged for every individual job — no
 * duplication of the claim, reachability, PageSpeed, or HTML-scan
 * logic. Callers are responsible for validating job ids and
 * restricting them to audit_depth = 'basic' before calling this (see
 * src/app/queue/actions.ts); this function's own safety net is
 * runAudit()'s atomic claim, which naturally turns any id that isn't
 * actually claimable right now (already running, already finished, or
 * simply nonexistent) into a `skipped` count without mutating that
 * row.
 *
 * Deduplicates the input (a job appearing twice collapses to one
 * `selected` entry) before building the work queue, and preserves the
 * given order — callers that want oldest-first execution (e.g. "Run
 * next batch") should pass ids already sorted that way. Concurrency is
 * a fixed internal constant, not caller-configurable: this batch runs
 * inside a single synchronous Server Action request, so it stays
 * conservative until a background worker exists (see CLAUDE.md).
 *
 * Every job is isolated: a thrown exception or a failed outcome from
 * one job can never abort or skip any other job in the batch.
 */
export async function runAuditBatch(jobIds: string[]): Promise<BatchSummary> {
  const uniqueIds = Array.from(new Set(jobIds));

  const summary: BatchSummary = {
    selected: uniqueIds.length,
    claimed: 0,
    completed: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
  };

  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= uniqueIds.length) return;
      const jobId = uniqueIds[index];

      try {
        const result = await runAudit(jobId);
        if (!result.ok) {
          if (result.alreadyClaimed) {
            summary.skipped += 1;
          } else {
            summary.claimed += 1;
            summary.failed += 1;
          }
          continue;
        }

        summary.claimed += 1;
        if (result.status === "completed") summary.completed += 1;
        else if (result.status === "partial") summary.partial += 1;
        else summary.failed += 1;
      } catch (err) {
        console.error("[runAuditBatch] unexpected error running job", jobId, err);
        summary.claimed += 1;
        summary.failed += 1;
      }
    }
  }

  const workerCount = Math.min(CONCURRENCY, uniqueIds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return summary;
}
