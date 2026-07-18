import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { AuditJobStatus, AuditProgressStage } from "@/lib/supabase/database.types";

// No "server-only" guard here: updateAuditProgress() is parameterized
// by an already-created Supabase client and touches no secret/env
// value itself (run-audit.ts, which does carry the guard, is its only
// realistic caller), and progressStageLabel() is a pure function the
// /queue Client Component needs to call directly on every poll tick.

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Best-effort, non-terminal progress write. Scoped to the exact job
 * id AND status='auditing', so it can never write progress onto a job
 * that has already reached (or raced to) a terminal state. Never
 * throws into the caller — a progress-write failure must not fail the
 * actual audit — and only logs a sanitized message (the Postgres
 * error's own message only, never a stack trace) server-side.
 *
 * Terminal stages (completed/partial/failed) are deliberately NOT set
 * through this function — they're folded directly into the same
 * database statement that writes the corresponding terminal
 * audit_jobs.status in run-audit.ts, so status and terminal progress
 * can never momentarily disagree. Likewise `claiming` is set inside
 * the existing atomic claim UPDATE, not here.
 */
export async function updateAuditProgress(
  supabase: ServiceClient,
  jobId: string,
  stage: Exclude<AuditProgressStage, "completed" | "partial" | "failed" | "claiming">,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("audit_jobs")
      .update({ progress_stage: stage, progress_updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "auditing");

    if (error) {
      console.error(`[updateAuditProgress] failed to write stage "${stage}":`, error.message);
    }
  } catch (err) {
    console.error(`[updateAuditProgress] unexpected error writing stage "${stage}":`, err);
  }
}

/**
 * Resolves a single, honest, user-facing label from a job's status
 * and (while auditing) its current progress_stage. Status is always
 * checked first and is authoritative for every terminal/waiting case;
 * progress_stage is only consulted for the fine-grained sub-label
 * while status is 'auditing'. Never exposes an internal error message
 * or stack trace.
 */
export function progressStageLabel(
  status: AuditJobStatus,
  stage: AuditProgressStage | null,
): string {
  if (status === "queued" || status === "pending") {
    return "Waiting for an available audit slot…";
  }
  if (status === "completed") return "Audit completed";
  if (status === "partial") return "Audit completed partially";
  if (status === "failed") return "Audit failed";

  switch (stage) {
    case "checking_reachability":
      return "Checking whether the website can be reached…";
    case "analyzing_website":
      return "Running performance and homepage checks…";
    case "saving_results":
      return "Saving audit findings…";
    case "calculating_score":
      return "Calculating the website-opportunity score…";
    case "claiming":
    default:
      return "Starting audit…";
  }
}
