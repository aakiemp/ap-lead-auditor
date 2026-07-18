import "server-only";

import { checkReachability, SsrfBlockedError } from "@/lib/audit/check-reachability";
import { InvalidUrlError, parseAndNormalizeInputUrl, stripTrackingParams } from "@/lib/audit/normalize-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { WebsiteIntakeInput } from "@/lib/validation/website-intake";

export type CreateManualLeadResult =
  | { ok: true; businessId: string }
  | { ok: false; error: string };

const GENERIC_SAVE_ERROR = "Could not save this lead right now. Please try again.";
const SSRF_BLOCKED_ERROR =
  "This website address can't be audited because it points to a private, local, or restricted network destination.";

/**
 * Orchestrates the Phase 3 manual intake flow: validates + normalizes
 * the URL, runs the SSRF-guarded reachability check, then writes
 * businesses -> websites -> audit_jobs in that order. All three writes
 * happen server-side via the service-role client.
 *
 * URL validation failures and SSRF blocks happen before any database
 * write. If a write after the first one fails, the newly created
 * business row is deleted and foreign-key cascades clean up any child
 * rows — see CLAUDE.md for why this (rather than a transactional RPC)
 * is the Phase 3 approach.
 */
export async function createManualLead(input: WebsiteIntakeInput): Promise<CreateManualLeadResult> {
  let normalized;
  try {
    normalized = parseAndNormalizeInputUrl(input.websiteUrl);
  } catch (err) {
    if (err instanceof InvalidUrlError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Enter a valid website URL." };
  }

  let reachability;
  try {
    reachability = await checkReachability(normalized.url);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return { ok: false, error: SSRF_BLOCKED_ERROR };
    }
    console.error("[createManualLead] reachability check failed unexpectedly:", err);
    return { ok: false, error: "Could not check this website right now. Please try again." };
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({
      name: input.businessName,
      city: input.city ?? null,
      state: input.state ?? null,
      phone: input.phone ?? null,
      source: "manual",
    })
    .select("id")
    .single();

  if (businessError || !business) {
    console.error("[createManualLead] businesses insert failed:", businessError);
    return { ok: false, error: GENERIC_SAVE_ERROR };
  }

  const finalUrl = reachability.finalUrl
    ? stripTrackingParams(new URL(reachability.finalUrl))
    : null;

  const { data: website, error: websiteError } = await supabase
    .from("websites")
    .insert({
      business_id: business.id,
      input_url: input.websiteUrl.trim(),
      final_url: finalUrl,
      root_domain: normalized.rootDomain,
      is_reachable: reachability.isReachable,
      http_status: reachability.httpStatus,
      https_enabled: reachability.httpsEnabled,
      redirect_count: reachability.redirectCount,
      redirect_chain: reachability.redirectChain,
      http_to_https_redirect: reachability.httpToHttpsRedirect,
      failure_reason: reachability.failureReason,
      last_checked_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (websiteError || !website) {
    console.error("[createManualLead] websites insert failed:", websiteError);
    await supabase.from("businesses").delete().eq("id", business.id);
    return { ok: false, error: GENERIC_SAVE_ERROR };
  }

  const { error: jobError } = await supabase.from("audit_jobs").insert({
    business_id: business.id,
    website_id: website.id,
    audit_depth: "basic",
    status: "queued",
  });

  if (jobError) {
    console.error("[createManualLead] audit_jobs insert failed:", jobError);
    await supabase.from("businesses").delete().eq("id", business.id);
    return { ok: false, error: GENERIC_SAVE_ERROR };
  }

  return { ok: true, businessId: business.id };
}
