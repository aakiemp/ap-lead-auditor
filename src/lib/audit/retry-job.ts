import "server-only";

import { runAudit, type RunAuditResult } from "@/lib/audit/run-audit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Retries a failed or partial basic audit job in one explicit action:
 * atomically resets it from failed/partial back to queued, then
 * immediately calls the existing, unmodified runAudit() — which
 * performs its own atomic claim (queued -> auditing) and increments
 * `attempt` by exactly one as part of that claim (see run-audit.ts).
 * This reset step itself never touches `attempt`, so one retry click
 * can never double-increment it.
 *
 * Reuses the existing audit_jobs row rather than creating a new one:
 * audit_jobs represents the current queue slot for this business's
 * basic audit, while audits (written by writeAuditOutcome inside
 * runAudit) is the immutable history — every retry inserts a brand
 * new audits row and never touches a prior one.
 *
 * The reset's WHERE clause (status IN ('failed','partial')) is the
 * same atomic-guard pattern used everywhere else in this project: if
 * the job isn't actually in a retryable state right now (already
 * retried by a concurrent click, or somehow mid-flight), the UPDATE
 * affects 0 rows and this returns a plain "can't retry" error without
 * calling runAudit() at all.
 */
export async function retryAuditJob(jobId: string): Promise<RunAuditResult> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: reset, error: resetError } = await supabase
    .from("audit_jobs")
    .update({ status: "queued", error_message: null })
    .eq("id", jobId)
    .in("status", ["failed", "partial"])
    .select("id")
    .maybeSingle();

  if (resetError) {
    console.error("[retryAuditJob] failed to reset job:", resetError);
    return { ok: false, error: "Could not retry this audit right now. Please try again." };
  }

  if (!reset) {
    return {
      ok: false,
      error: "This job is not currently in a retryable state.",
      alreadyClaimed: true,
    };
  }

  return runAudit(jobId);
}
