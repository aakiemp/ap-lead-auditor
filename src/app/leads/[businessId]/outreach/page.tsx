import Link from "next/link";
import { notFound } from "next/navigation";

import type { OutreachBriefData, OutreachFinding } from "@/lib/outreach/build-prospect-brief";
import { defaultLeadProfile, getFollowUpState, getTodayISODate } from "@/lib/pipeline/lead-profile";
import { calculateEffectiveScore } from "@/lib/scoring/effective-score";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { AuditFinding, DeviceType } from "@/lib/supabase/database.types";

import { PipelinePanel } from "../pipeline-panel";
import { OutreachBuilder } from "./outreach-builder";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCREENSHOT_SIGNED_URL_TTL_SECONDS = 3600;
const DEVICE_TYPES: DeviceType[] = ["mobile", "desktop"];
const EVIDENCE_MAX_LENGTH = 300;

function preparedDateLabel(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Strips any remaining markup and caps length before evidence ever leaves the server. */
function sanitizeEvidence(raw: string | null): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (!stripped) return null;
  return stripped.length > EVIDENCE_MAX_LENGTH ? `${stripped.slice(0, EVIDENCE_MAX_LENGTH)}…` : stripped;
}

function toOutreachFinding(finding: AuditFinding): OutreachFinding {
  return {
    key: finding.id,
    title: finding.title,
    description: finding.description,
    evidence: sanitizeEvidence(finding.evidence),
    status: finding.status,
    confidence: finding.confidence,
  };
}

export default async function OutreachPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  if (!UUID_PATTERN.test(businessId)) {
    notFound();
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data: business } = await supabase.from("businesses").select("*").eq("id", businessId).maybeSingle();

  if (!business) {
    notFound();
  }

  const { data: website } = await supabase
    .from("websites")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  const latestAudit = website
    ? (
        await supabase
          .from("audits")
          .select("*")
          .eq("website_id", website.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data
    : null;

  if (!latestAudit) {
    notFound();
  }

  const { data: findings } = await supabase
    .from("audit_findings")
    .select("*")
    .eq("audit_id", latestAudit.id)
    .order("points", { ascending: false });

  const { data: searchLinks } = await supabase
    .from("search_businesses")
    .select("search_id, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1);

  const searchId = searchLinks?.[0]?.search_id ?? null;
  const { data: search } = searchId
    ? await supabase.from("searches").select("niche, city, state").eq("id", searchId).maybeSingle()
    : { data: null };

  const { data: screenshots } = await supabase
    .from("screenshots")
    .select("device_type, storage_path")
    .eq("audit_id", latestAudit.id);

  const screenshotByDevice = new Map((screenshots ?? []).map((s) => [s.device_type, s]));

  const signedScreenshotUrls = Object.fromEntries(
    await Promise.all(
      DEVICE_TYPES.map(async (device) => {
        const screenshot = screenshotByDevice.get(device);
        if (!screenshot) return [device, null] as const;
        const { data: signed } = await supabase.storage
          .from("screenshots")
          .createSignedUrl(screenshot.storage_path, SCREENSHOT_SIGNED_URL_TTL_SECONDS);
        return [device, signed?.signedUrl ?? null] as const;
      }),
    ),
  ) as Record<DeviceType, string | null>;

  const { score: effectiveScore } = calculateEffectiveScore(findings ?? []);

  const { data: fetchedProfile } = await supabase
    .from("lead_profiles")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  const leadProfile = fetchedProfile ?? defaultLeadProfile(businessId);
  const followUpState = getFollowUpState(leadProfile.next_follow_up_date, leadProfile.status, getTodayISODate());

  // Narrow, sanitized DTO only — never the raw Supabase rows. See
  // CLAUDE.md for the exact allowed/forbidden field list. Screenshot
  // display data (signed URLs) is passed to the Client Component as a
  // SEPARATE prop below, never folded into this object, so a signed
  // URL can never reach buildProspectBrief/renderPlainText/
  // renderMarkdown/clipboard output.
  const briefData: OutreachBriefData = {
    businessName: business.name,
    primaryCategory: business.primary_category,
    city: business.city,
    state: business.state,
    address: business.address,
    phone: business.phone,
    source: business.source === "google_places" ? "google_places" : "manual",
    searchContext: search ? { niche: search.niche, city: search.city, state: search.state } : null,
    websiteDisplayUrl: website?.final_url ?? website?.input_url ?? null,
    websiteReachable: website?.is_reachable ?? null,
    googleRating: business.google_rating,
    googleReviewCount: business.google_review_count,
    googleMapsUrl: business.google_maps_url,
    auditStatus: latestAudit.status,
    effectiveScore,
    auditSummary: latestAudit.summary,
    homepageTitle: latestAudit.homepage_title,
    findings: (findings ?? []).map(toOutreachFinding),
    screenshotAvailability: {
      mobile: screenshotByDevice.has("mobile"),
      desktop: screenshotByDevice.has("desktop"),
    },
    preparedDate: preparedDateLabel(),
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <Link href={`/leads/${businessId}`} className="text-sm text-zinc-500 hover:text-zinc-700">
          ← {business.name}
        </Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">Prepare outreach</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Generated from current audit evidence — nothing here is sent automatically.
        </p>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-6 px-8 py-10">
        <PipelinePanel
          businessId={businessId}
          data={{
            status: leadProfile.status,
            priority: leadProfile.priority,
            notes: leadProfile.notes,
            outreachAngle: leadProfile.outreach_angle,
            lastContactedDate: leadProfile.last_contacted_date,
            nextFollowUpDate: leadProfile.next_follow_up_date,
          }}
          followUpState={followUpState}
        />
        <OutreachBuilder data={briefData} screenshotUrls={signedScreenshotUrls} />
      </main>
    </div>
  );
}
