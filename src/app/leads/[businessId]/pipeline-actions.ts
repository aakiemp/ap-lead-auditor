"use server";

import { revalidatePath } from "next/cache";

import {
  businessIdSchema,
  leadDateSchema,
  leadNotesSchema,
  leadOutreachAngleSchema,
  leadPrioritySchema,
  leadStatusSchema,
} from "@/lib/validation/pipeline";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const GENERIC_ERROR = "Could not save this right now. Please try again.";
const NOT_FOUND_ERROR = "This lead's profile could not be found.";

function revalidateLeadPaths(businessId: string) {
  revalidatePath(`/leads/${businessId}`);
  revalidatePath(`/leads/${businessId}/outreach`);
  revalidatePath("/leads");
}

export interface PipelineActionState {
  error: string | null;
}

/**
 * Plain UPDATE ... SET status = ... WHERE business_id = ... — the
 * Phase 11 migration's lead_profiles_log_status_change trigger writes
 * the lead_activity history row atomically in the same statement's
 * transaction; this action never touches lead_activity itself.
 * Fully permissive: any of the 10 statuses to any other, no
 * transition-graph validation, matching the approved design.
 */
export async function updateLeadStatusAction(
  businessId: string,
  _prevState: PipelineActionState,
  formData: FormData,
): Promise<PipelineActionState> {
  const businessIdResult = businessIdSchema.safeParse(businessId);
  const statusResult = leadStatusSchema.safeParse(formData.get("status"));

  if (!businessIdResult.success || !statusResult.success) {
    return { error: "This action could not be completed." };
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("lead_profiles")
    .update({ status: statusResult.data })
    .eq("business_id", businessIdResult.data)
    .select("business_id")
    .maybeSingle();

  if (error) {
    console.error("[updateLeadStatusAction] update failed:", error.message);
    return { error: GENERIC_ERROR };
  }
  if (!data) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidateLeadPaths(businessIdResult.data);
  return { error: null };
}

export async function updateLeadPriorityAction(
  businessId: string,
  _prevState: PipelineActionState,
  formData: FormData,
): Promise<PipelineActionState> {
  const businessIdResult = businessIdSchema.safeParse(businessId);
  const raw = formData.get("priority");
  const priorityResult = leadPrioritySchema.safeParse(raw === "" ? null : raw);

  if (!businessIdResult.success || !priorityResult.success) {
    return { error: "This action could not be completed." };
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("lead_profiles")
    .update({ priority: priorityResult.data })
    .eq("business_id", businessIdResult.data)
    .select("business_id")
    .maybeSingle();

  if (error) {
    console.error("[updateLeadPriorityAction] update failed:", error.message);
    return { error: GENERIC_ERROR };
  }
  if (!data) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidateLeadPaths(businessIdResult.data);
  return { error: null };
}

/**
 * Notes are treated as untrusted plain text throughout: trimmed and
 * length-validated here server-side, never rendered with
 * dangerouslySetInnerHTML, and never included in any Phase 10
 * outreach output (the outreach DTO does not include this field at
 * all, structurally).
 */
export async function updateLeadNotesAction(
  businessId: string,
  _prevState: PipelineActionState,
  formData: FormData,
): Promise<PipelineActionState> {
  const businessIdResult = businessIdSchema.safeParse(businessId);
  if (!businessIdResult.success) {
    return { error: "This action could not be completed." };
  }

  const notesResult = leadNotesSchema.safeParse(formData.get("notes") ?? "");
  if (!notesResult.success) {
    return { error: notesResult.error.issues[0]?.message ?? "Invalid notes." };
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("lead_profiles")
    .update({ notes: notesResult.data.length > 0 ? notesResult.data : null })
    .eq("business_id", businessIdResult.data)
    .select("business_id")
    .maybeSingle();

  if (error) {
    console.error("[updateLeadNotesAction] update failed:", error.message);
    return { error: GENERIC_ERROR };
  }
  if (!data) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidateLeadPaths(businessIdResult.data);
  return { error: null };
}

/**
 * Freeform, optional, internal only. Never automatically populated
 * from findings, and never automatically folded into copied outreach
 * output — Phase 10's brief generation does not read this field.
 */
export async function updateLeadOutreachAngleAction(
  businessId: string,
  _prevState: PipelineActionState,
  formData: FormData,
): Promise<PipelineActionState> {
  const businessIdResult = businessIdSchema.safeParse(businessId);
  if (!businessIdResult.success) {
    return { error: "This action could not be completed." };
  }

  const angleResult = leadOutreachAngleSchema.safeParse(formData.get("outreachAngle") ?? "");
  if (!angleResult.success) {
    return { error: angleResult.error.issues[0]?.message ?? "Invalid outreach angle." };
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("lead_profiles")
    .update({ outreach_angle: angleResult.data.length > 0 ? angleResult.data : null })
    .eq("business_id", businessIdResult.data)
    .select("business_id")
    .maybeSingle();

  if (error) {
    console.error("[updateLeadOutreachAngleAction] update failed:", error.message);
    return { error: GENERIC_ERROR };
  }
  if (!data) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidateLeadPaths(businessIdResult.data);
  return { error: null };
}

/**
 * Both dates are edited and submitted together, deliberately as a
 * separate action from status: selecting "contacted" in the status
 * form may prefill this form's last-contacted input client-side, but
 * nothing is written until the operator explicitly submits this form
 * — see pipeline-panel.tsx.
 */
export async function updateLeadDatesAction(
  businessId: string,
  _prevState: PipelineActionState,
  formData: FormData,
): Promise<PipelineActionState> {
  const businessIdResult = businessIdSchema.safeParse(businessId);

  const rawLastContacted = formData.get("lastContactedDate");
  const rawNextFollowUp = formData.get("nextFollowUpDate");
  const lastContactedResult = leadDateSchema.safeParse(rawLastContacted === "" ? null : rawLastContacted);
  const nextFollowUpResult = leadDateSchema.safeParse(rawNextFollowUp === "" ? null : rawNextFollowUp);

  if (!businessIdResult.success || !lastContactedResult.success || !nextFollowUpResult.success) {
    return { error: "Enter valid dates." };
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("lead_profiles")
    .update({
      last_contacted_date: lastContactedResult.data,
      next_follow_up_date: nextFollowUpResult.data,
    })
    .eq("business_id", businessIdResult.data)
    .select("business_id")
    .maybeSingle();

  if (error) {
    console.error("[updateLeadDatesAction] update failed:", error.message);
    return { error: GENERIC_ERROR };
  }
  if (!data) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidateLeadPaths(businessIdResult.data);
  return { error: null };
}
