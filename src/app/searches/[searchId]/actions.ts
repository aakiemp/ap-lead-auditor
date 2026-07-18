"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { AuditJobInsert, AuditJobStatus } from "@/lib/supabase/database.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_BASIC_JOB_STATUSES: AuditJobStatus[] = ["pending", "queued", "auditing"];

export interface QueueSelectedState {
  error: string | null;
  summary: string | null;
}

/**
 * Creates 'basic' audit_jobs rows for manually-selected businesses on
 * a search results page. This is the ONLY place discovery/import leads
 * to an audit_jobs row — runSearch() never creates one itself. Every
 * selected id is validated as a UUID, then cross-checked against
 * search_businesses to ensure it actually belongs to this search
 * (rejecting stray/forged ids). Businesses with no websites row, or
 * with an already-active basic job, are skipped and counted rather
 * than erroring the whole batch. Never starts PageSpeed, HTML
 * scanning, screenshots, or reachability checks itself — those only
 * happen later when a queued job is actually run via "Run basic
 * audit" (see run-audit.ts).
 */
export async function queueSelectedAction(
  searchId: string,
  _prevState: QueueSelectedState,
  formData: FormData,
): Promise<QueueSelectedState> {
  if (!UUID_PATTERN.test(searchId)) {
    return { error: "This action could not be completed.", summary: null };
  }

  const submittedIds = formData.getAll("businessId").map(String);
  const wellFormedIds = submittedIds.filter((id) => UUID_PATTERN.test(id));

  if (submittedIds.length === 0) {
    return { error: "Select at least one business to queue.", summary: null };
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data: linked, error: linkedError } = await supabase
    .from("search_businesses")
    .select("business_id")
    .eq("search_id", searchId)
    .in("business_id", wellFormedIds);

  if (linkedError) {
    console.error("[queueSelectedAction] search_businesses lookup failed:", linkedError);
    return { error: "Could not queue these businesses right now. Please try again.", summary: null };
  }

  const linkedIds = (linked ?? []).map((row) => row.business_id);
  const invalidSelectionCount = submittedIds.length - linkedIds.length;

  if (linkedIds.length === 0) {
    return { error: "None of the selected businesses could be queued.", summary: null };
  }

  const [{ data: websites, error: websitesError }, { data: activeJobs, error: jobsError }] =
    await Promise.all([
      supabase.from("websites").select("id, business_id").in("business_id", linkedIds),
      supabase
        .from("audit_jobs")
        .select("business_id")
        .in("business_id", linkedIds)
        .eq("audit_depth", "basic")
        .in("status", ACTIVE_BASIC_JOB_STATUSES),
    ]);

  if (websitesError || jobsError) {
    console.error("[queueSelectedAction] websites/audit_jobs lookup failed:", websitesError ?? jobsError);
    return { error: "Could not queue these businesses right now. Please try again.", summary: null };
  }

  const websiteByBusiness = new Map((websites ?? []).map((w) => [w.business_id, w.id]));
  const alreadyQueuedIds = new Set((activeJobs ?? []).map((j) => j.business_id));

  const toQueue: AuditJobInsert[] = [];
  let noWebsiteCount = 0;
  let alreadyQueuedCount = 0;

  for (const businessId of linkedIds) {
    if (alreadyQueuedIds.has(businessId)) {
      alreadyQueuedCount++;
      continue;
    }
    const websiteId = websiteByBusiness.get(businessId);
    if (!websiteId) {
      noWebsiteCount++;
      continue;
    }
    toQueue.push({
      business_id: businessId,
      website_id: websiteId,
      audit_depth: "basic",
      status: "queued",
    });
  }

  if (toQueue.length > 0) {
    const { error: insertError } = await supabase.from("audit_jobs").insert(toQueue);
    if (insertError) {
      console.error("[queueSelectedAction] audit_jobs insert failed:", insertError);
      return { error: "Could not queue these businesses right now. Please try again.", summary: null };
    }
  }

  revalidatePath(`/searches/${searchId}`);
  revalidatePath("/leads");

  const parts = [`${toQueue.length} queued`];
  if (noWebsiteCount > 0) parts.push(`${noWebsiteCount} skipped (no website)`);
  if (alreadyQueuedCount > 0) parts.push(`${alreadyQueuedCount} skipped (already queued)`);
  if (invalidSelectionCount > 0) parts.push(`${invalidSelectionCount} invalid selection`);

  return { error: null, summary: parts.join(", ") };
}
