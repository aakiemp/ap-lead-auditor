"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { batchSizeSchema, DEFAULT_BATCH_SIZE } from "@/lib/validation/queue-batch";
import type { AuditJobStatus, AuditProgressStage } from "@/lib/supabase/database.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_POLL_IDS = 10;

export interface ResolveNextBatchResult {
  error: string | null;
  jobIds: string[];
}

/**
 * Read-only. Resolves the oldest N eligible queued/pending basic job
 * ids (N = the requested batch size), without claiming or otherwise
 * touching them. The caller (queue-table.tsx) stores the returned ids
 * as its tracked progress scope, then submits those exact ids through
 * runSelectedAuditsAction -- deliberately not re-resolved at execution
 * time, since the queue can change in between; each id is still
 * atomically (re-)validated and claimed by runAudit() at that point,
 * so resolving here never reserves or guarantees a job.
 */
export async function resolveNextBatchJobIdsAction(batchSizeInput: number): Promise<ResolveNextBatchResult> {
  const parsedSize = batchSizeSchema.safeParse(batchSizeInput);
  const batchSize = parsedSize.success ? parsedSize.data : DEFAULT_BATCH_SIZE;

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("audit_jobs")
    .select("id")
    .eq("audit_depth", "basic")
    .in("status", ["queued", "pending"])
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    console.error("[resolveNextBatchJobIdsAction] failed to resolve next batch:", error);
    return { error: "Could not resolve the next batch right now. Please try again.", jobIds: [] };
  }

  const jobIds = (data ?? []).map((row) => row.id);

  if (jobIds.length === 0) {
    return { error: "No queued jobs are available to run.", jobIds: [] };
  }

  return { error: null, jobIds };
}

export interface JobProgressRow {
  id: string;
  status: AuditJobStatus;
  progressStage: AuditProgressStage | null;
  progressUpdatedAt: string | null;
}

export type AuditProgressPollResult = { ok: true; rows: JobProgressRow[] } | { ok: false };

/**
 * Read-only polling endpoint for the /queue progress UI. Accepts at
 * most 10 (already-validated) job ids, queries only those ids,
 * restricted to audit_depth='basic', and returns only id/status/
 * progress_stage/progress_updated_at -- no business-sensitive or
 * operational fields (no claimed_by, error_message, attempt, website/
 * business data). Makes no mutation and no external call.
 *
 * Returns { ok: false } on any query failure rather than an empty
 * row list, specifically so the poller can distinguish "nothing to
 * report" from "the read failed" and retain its last known UI state
 * instead of clearing it -- a poll failure must never look like every
 * tracked job disappeared.
 */
export async function getAuditProgressAction(jobIds: string[]): Promise<AuditProgressPollResult> {
  const validIds = Array.from(new Set(jobIds.filter((id) => UUID_PATTERN.test(id)))).slice(0, MAX_POLL_IDS);

  if (validIds.length === 0) {
    return { ok: true, rows: [] };
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("audit_jobs")
    .select("id, status, progress_stage, progress_updated_at")
    .in("id", validIds)
    .eq("audit_depth", "basic");

  if (error) {
    console.error("[getAuditProgressAction] failed to fetch progress:", error);
    return { ok: false };
  }

  return {
    ok: true,
    rows: (data ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      progressStage: row.progress_stage,
      progressUpdatedAt: row.progress_updated_at,
    })),
  };
}
