"use server";

import { revalidatePath } from "next/cache";

import { runAuditBatch, type BatchSummary } from "@/lib/audit/run-audit-batch";
import { retryAuditJob } from "@/lib/audit/retry-job";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { batchSizeSchema, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE } from "@/lib/validation/queue-batch";

type SupabaseServiceRoleClient = ReturnType<typeof createSupabaseServiceRoleClient>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RunBatchState {
  error: string | null;
  summary: BatchSummary | null;
}

/**
 * Restricts a submitted id list to ids that actually exist as
 * audit_depth='basic' audit_jobs rows -- this is the "restrict
 * execution to audit_depth = basic" + "validate all submitted IDs
 * server-side" guard from CLAUDE.md, independent of runAudit()'s own
 * atomic claim (which only checks status, not depth).
 */
async function eligibleBasicJobIds(
  supabase: SupabaseServiceRoleClient,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("audit_jobs")
    .select("id")
    .in("id", ids)
    .eq("audit_depth", "basic");
  if (error || !data) return [];
  return data.map((row) => row.id);
}

/**
 * Runs a manually-selected batch of queued/pending basic jobs.
 * Deduplicates and caps at MAX_BATCH_SIZE before touching the
 * database, filters to real audit_depth='basic' rows, then delegates
 * to runAuditBatch() for bounded-concurrency execution. Any submitted
 * id that turns out invalid, nonexistent, or non-basic is folded into
 * the returned summary's `skipped` count rather than erroring the
 * whole batch.
 */
export async function runSelectedAuditsAction(
  _prevState: RunBatchState,
  formData: FormData,
): Promise<RunBatchState> {
  const submitted = formData.getAll("jobId").map(String);
  const wellFormed = Array.from(new Set(submitted.filter((id) => UUID_PATTERN.test(id))));

  if (wellFormed.length === 0) {
    return { error: "Select at least one queued job to run.", summary: null };
  }
  if (wellFormed.length > MAX_BATCH_SIZE) {
    return { error: `Select at most ${MAX_BATCH_SIZE} jobs at a time.`, summary: null };
  }

  const supabase = createSupabaseServiceRoleClient();
  const eligible = await eligibleBasicJobIds(supabase, wellFormed);
  const rejectedCount = wellFormed.length - eligible.length;

  const summary = await runAuditBatch(eligible);
  summary.selected += rejectedCount;
  summary.skipped += rejectedCount;

  revalidatePath("/queue");
  revalidatePath("/leads");

  return { error: null, summary };
}

/**
 * Runs the oldest N available queued/pending basic jobs, where N is
 * the requested batch size (default/max enforced by batchSizeSchema).
 * If fewer than N jobs are available, runs all of them without
 * erroring -- `summary.selected` reflects the actual count picked.
 */
export async function runNextBatchAction(
  _prevState: RunBatchState,
  formData: FormData,
): Promise<RunBatchState> {
  const parsedSize = batchSizeSchema.safeParse(formData.get("batchSize") ?? undefined);
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
    console.error("[runNextBatchAction] failed to fetch next batch:", error);
    return { error: "Could not start the next batch right now. Please try again.", summary: null };
  }

  const jobIds = (data ?? []).map((row) => row.id);

  if (jobIds.length === 0) {
    return { error: "No queued jobs are available to run.", summary: null };
  }

  const summary = await runAuditBatch(jobIds);

  revalidatePath("/queue");
  revalidatePath("/leads");

  return { error: null, summary };
}

export interface RetryJobState {
  error: string | null;
  status: "completed" | "partial" | "failed" | null;
}

/**
 * Retries one failed/partial job: reads jobId from the submitted
 * FormData (rather than a bound argument) so every retry button on
 * the queue page can share a single useActionState instance, giving
 * the UI one shared `pending` flag to disable every execution control
 * on the page while any batch or retry action is in flight.
 */
export async function retryJobAction(
  _prevState: RetryJobState,
  formData: FormData,
): Promise<RetryJobState> {
  const jobId = formData.get("jobId");
  if (typeof jobId !== "string" || !UUID_PATTERN.test(jobId)) {
    return { error: "This action could not be completed.", status: null };
  }

  const result = await retryAuditJob(jobId);

  revalidatePath("/queue");
  revalidatePath("/leads");

  if (!result.ok) {
    return { error: result.error, status: null };
  }

  return { error: null, status: result.status };
}
