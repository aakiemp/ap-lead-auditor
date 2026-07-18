import "server-only";

import { ApifyScreenshotError, captureScreenshot, type CapturedImage } from "@/lib/audit/apify-screenshot";
import { serverEnv } from "@/lib/env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { DeviceType } from "@/lib/supabase/database.types";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

// The apify/screenshot-url actor has no height input — it always
// captures the page's full scrollable height at the given width (see
// apify-screenshot.ts). viewport_height here is the nominal value
// stored on our own screenshots row for reference/display, not a
// parameter sent to the actor.
const VIEWPORTS: Record<DeviceType, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1366, height: 768 },
};

export type CaptureOutcome = "captured" | "already_exists" | "failed";

export interface CaptureScreenshotsSummary {
  mobile: CaptureOutcome;
  desktop: CaptureOutcome;
}

/**
 * Captures mobile and desktop homepage screenshots for an audit,
 * independently and in parallel. Never throws — a failure for one or
 * both device types is reported in the returned summary only, and
 * never touches audits/audit_jobs/audit_findings/audit_scores. A
 * device type that already has a screenshot row is skipped (not
 * re-captured), so a repeated call is always safe.
 */
export async function captureScreenshotsForAudit(
  auditId: string,
  businessId: string,
  targetUrl: string,
): Promise<CaptureScreenshotsSummary> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: existing } = await supabase
    .from("screenshots")
    .select("device_type")
    .eq("audit_id", auditId);

  const existingTypes = new Set((existing ?? []).map((row) => row.device_type));

  const [mobile, desktop] = await Promise.all([
    existingTypes.has("mobile")
      ? Promise.resolve<CaptureOutcome>("already_exists")
      : captureOne(supabase, "mobile", auditId, businessId, targetUrl),
    existingTypes.has("desktop")
      ? Promise.resolve<CaptureOutcome>("already_exists")
      : captureOne(supabase, "desktop", auditId, businessId, targetUrl),
  ]);

  return { mobile, desktop };
}

async function captureOne(
  supabase: ServiceClient,
  deviceType: DeviceType,
  auditId: string,
  businessId: string,
  targetUrl: string,
): Promise<CaptureOutcome> {
  const viewport = VIEWPORTS[deviceType];

  let image: CapturedImage;
  try {
    image = await captureScreenshot({
      url: targetUrl,
      viewportWidth: viewport.width,
      actorId: serverEnv.APIFY_SCREENSHOT_ACTOR_ID,
      apiToken: serverEnv.APIFY_API_TOKEN,
    });
  } catch (err) {
    const reason = err instanceof ApifyScreenshotError ? err.message : "unexpected error";
    console.error(`[captureScreenshots] ${deviceType} capture failed:`, reason);
    return "failed";
  }

  const storagePath = `${businessId}/${auditId}/${deviceType}.png`;

  const { error: uploadError } = await supabase.storage
    .from("screenshots")
    .upload(storagePath, image.bytes, { contentType: image.contentType, upsert: false });

  if (uploadError) {
    console.error(`[captureScreenshots] ${deviceType} upload failed:`, uploadError.message);
    return "failed";
  }

  const { error: insertError } = await supabase.from("screenshots").insert({
    audit_id: auditId,
    business_id: businessId,
    device_type: deviceType,
    page_url: targetUrl,
    storage_path: storagePath,
    viewport_width: viewport.width,
    viewport_height: viewport.height,
    full_page: true,
  });

  if (insertError) {
    // 23505 = unique_violation: a concurrent request already recorded
    // this device type. The upload above is then a harmless orphaned
    // object (storage is cheap, and the path is per-audit-per-device
    // so it can't collide with the row that "won"). Any other error
    // is a genuine failure.
    if (insertError.code === "23505") {
      return "captured";
    }
    console.error(`[captureScreenshots] ${deviceType} row insert failed:`, insertError.message);
    return "failed";
  }

  return "captured";
}
