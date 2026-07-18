"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runAudit } from "@/lib/audit/run-audit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface RunAuditActionState {
  error: string | null;
}

export async function runAuditAction(
  businessId: string,
  jobId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's (state, formData) calling convention
  _prevState: RunAuditActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- this action takes no form fields; formData is unused
  _formData: FormData,
): Promise<RunAuditActionState> {
  const result = await runAudit(jobId);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/leads/${businessId}`);
  revalidatePath("/leads");
  return { error: null };
}

export interface UpdateFindingStatusState {
  error: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateFindingStatusSchema = z.object({
  businessId: z.string().regex(UUID_PATTERN, "Invalid business reference."),
  findingId: z.string().regex(UUID_PATTERN, "Invalid finding reference."),
  targetStatus: z.enum(["active", "verified", "dismissed"]),
});

/**
 * Updates a single finding's review status. Validates all three
 * inputs (businessId, findingId, targetStatus) before touching the
 * database, and scopes the update by both finding id and business id
 * so a mismatched/stale reference can't silently mutate an unrelated
 * business's finding. Never surfaces raw database errors to the UI.
 */
export async function updateFindingStatusAction(
  businessId: string,
  findingId: string,
  targetStatus: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's (state, formData) calling convention
  _prevState: UpdateFindingStatusState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- this action takes no form fields; formData is unused
  _formData: FormData,
): Promise<UpdateFindingStatusState> {
  const parsed = updateFindingStatusSchema.safeParse({ businessId, findingId, targetStatus });

  if (!parsed.success) {
    return { error: "This action could not be completed." };
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("audit_findings")
    .update({ status: parsed.data.targetStatus })
    .eq("id", parsed.data.findingId)
    .eq("business_id", parsed.data.businessId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[updateFindingStatusAction] update failed:", error);
    return { error: "Could not update this finding right now. Please try again." };
  }

  if (!data) {
    return { error: "This finding could not be found." };
  }

  revalidatePath(`/leads/${businessId}`);
  return { error: null };
}
