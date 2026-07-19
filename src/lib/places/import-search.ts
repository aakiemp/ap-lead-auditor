import "server-only";

import { InvalidUrlError, parseAndNormalizeInputUrl } from "@/lib/audit/normalize-url";
import { serverEnv } from "@/lib/env";
import { normalizePhoneNumber } from "@/lib/places/normalize-phone";
import {
  PlacesApiError,
  searchTextPlaces,
  type PlacesAddressComponent,
  type PlacesSearchResultItem,
} from "@/lib/places/places-client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { BusinessInsert, BusinessUpdate, Json } from "@/lib/supabase/database.types";

type SupabaseServiceRoleClient = ReturnType<typeof createSupabaseServiceRoleClient>;

const MAX_PAGES = 3;
const GOOGLE_MAX_PAGE_SIZE = 20;
// Google's nextPageToken is not immediately valid; a short delay
// between pages is required or the follow-up request can 400.
const PAGE_TOKEN_DELAY_MS = 2_000;

export interface RunSearchInput {
  niche: string;
  city: string;
  state: string;
  zip?: string | null;
  maxResults: number;
  minRating?: number | null;
  minReviews?: number | null;
  excludeNoWebsite: boolean;
  isTest: boolean;
}

export interface RunSearchResult {
  searchId: string;
  status: "completed" | "partial" | "failed";
  businessesFound: number;
  businessesImported: number;
  businessesFiltered: number;
  businessesWithoutWebsite: number;
  errorMessage: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeApiError(err: unknown): string {
  if (err instanceof PlacesApiError) {
    return err.message;
  }
  return "Could not complete the Google Places search. Please try again.";
}

function buildTextQuery(input: RunSearchInput): string {
  const location = input.zip
    ? `${input.city}, ${input.state} ${input.zip}`
    : `${input.city}, ${input.state}`;
  return `${input.niche} in ${location}`;
}

/**
 * Runs a Places Text Search (New) discovery flow end to end: creates
 * the `searches` row first (so a total API failure still leaves an
 * auditable failed row), pages through results (max 3 pages, capped
 * at 20 results per page per Google's limit), applies local
 * post-filters, and imports each surviving place. Never calls
 * checkReachability -- see ensureWebsiteRow below.
 */
export async function runSearch(input: RunSearchInput): Promise<RunSearchResult> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: searchRow, error: createError } = await supabase
    .from("searches")
    .insert({
      niche: input.niche,
      city: input.city,
      state: input.state,
      zip: input.zip ?? null,
      max_results: input.maxResults,
      min_rating: input.minRating ?? null,
      min_reviews: input.minReviews ?? null,
      exclude_no_website: input.excludeNoWebsite,
      is_test: input.isTest,
      status: "pending",
    })
    .select("id")
    .single();

  if (createError || !searchRow) {
    console.error("[runSearch] searches insert failed:", createError);
    throw new Error("Could not start this search. Please try again.");
  }

  const searchId = searchRow.id;

  const allPlaces: PlacesSearchResultItem[] = [];
  let pageToken: string | undefined;
  let paginationFailed = false;
  let failureMessage: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const remaining = input.maxResults - allPlaces.length;
    if (remaining <= 0) break;

    const pageSize = Math.min(remaining, GOOGLE_MAX_PAGE_SIZE);

    try {
      if (page > 0) {
        await sleep(PAGE_TOKEN_DELAY_MS);
      }
      const result = await searchTextPlaces({
        textQuery: buildTextQuery(input),
        pageSize,
        pageToken,
        minRating: input.minRating ?? undefined,
        apiKey: serverEnv.GOOGLE_PLACES_API_KEY,
      });
      allPlaces.push(...result.places);
      pageToken = result.nextPageToken ?? undefined;
      if (!pageToken) break;
    } catch (err) {
      if (page === 0) {
        // Total failure: nothing was ever fetched.
        const message = sanitizeApiError(err);
        await supabase
          .from("searches")
          .update({ status: "failed", error_message: message })
          .eq("id", searchId);
        return {
          searchId,
          status: "failed",
          businessesFound: 0,
          businessesImported: 0,
          businessesFiltered: 0,
          businessesWithoutWebsite: 0,
          errorMessage: message,
        };
      }
      // Partial failure: keep what was already fetched.
      paginationFailed = true;
      failureMessage = sanitizeApiError(err);
      break;
    }
  }

  const businessesFound = allPlaces.length;

  const filtered = allPlaces.filter((place) => {
    if (input.minReviews && (place.userRatingCount ?? 0) < input.minReviews) {
      return false;
    }
    if (input.excludeNoWebsite && !place.websiteUri) {
      return false;
    }
    return true;
  });

  const businessesFiltered = businessesFound - filtered.length;

  let importFailed = false;
  let businessesImported = 0;
  let businessesWithoutWebsite = 0;

  for (let i = 0; i < filtered.length; i++) {
    const place = filtered[i];
    try {
      const imported = await importOnePlace(supabase, place, input.isTest);
      businessesImported++;
      if (!imported.hasWebsite) businessesWithoutWebsite++;

      const { error: linkError } = await supabase.from("search_businesses").insert({
        search_id: searchId,
        business_id: imported.businessId,
        rank_in_search: i,
        is_new_business: imported.isNew,
        duplicate_warning: imported.duplicateWarning,
      });
      if (linkError) {
        console.error("[runSearch] search_businesses insert failed:", linkError);
        importFailed = true;
      }
    } catch (err) {
      console.error("[runSearch] importOnePlace failed:", err);
      importFailed = true;
    }
  }

  const status: RunSearchResult["status"] =
    paginationFailed || importFailed ? "partial" : "completed";
  const errorMessage = paginationFailed ? failureMessage : null;

  await supabase
    .from("searches")
    .update({
      status,
      businesses_found: businessesFound,
      businesses_imported: businessesImported,
      businesses_filtered: businessesFiltered,
      businesses_without_website: businessesWithoutWebsite,
      error_message: errorMessage,
    })
    .eq("id", searchId);

  return {
    searchId,
    status,
    businessesFound,
    businessesImported,
    businessesFiltered,
    businessesWithoutWebsite,
    errorMessage,
  };
}

interface ExtractedPlaceFields {
  googlePlaceId: string;
  name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  phoneNormalized: string | null;
  websiteUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
  openingHours: PlacesSearchResultItem["regularOpeningHours"] | null;
  businessStatus: string | null;
  primaryCategory: string | null;
  categories: string[] | null;
}

function findComponent(
  components: PlacesAddressComponent[] | undefined,
  type: string,
): string | null {
  const match = components?.find((c) => c.types?.includes(type));
  if (!match) return null;
  return match.longText ?? match.shortText ?? null;
}

function extractPlaceFields(place: PlacesSearchResultItem): ExtractedPlaceFields {
  const components = place.addressComponents;
  const phone = place.nationalPhoneNumber ?? null;

  return {
    googlePlaceId: place.id,
    name: place.displayName?.text ?? "Unknown business",
    city: findComponent(components, "locality"),
    state: findComponent(components, "administrative_area_level_1"),
    zip: findComponent(components, "postal_code"),
    address: place.formattedAddress ?? null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    phone,
    phoneNormalized: normalizePhoneNumber(phone),
    websiteUri: place.websiteUri ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    googleMapsUrl: place.googleMapsUri ?? null,
    openingHours: place.regularOpeningHours ?? null,
    businessStatus: place.businessStatus ?? null,
    primaryCategory: place.primaryTypeDisplayName?.text ?? place.primaryType ?? null,
    categories: place.types ?? null,
  };
}

interface ImportOnePlaceResult {
  businessId: string;
  isNew: boolean;
  hasWebsite: boolean;
  duplicateWarning: string | null;
}

/**
 * Imports a single Places result. Primary dedup is an exact
 * google_place_id match (reuse + refresh, never clobbering existing
 * non-blank manual data with a blank Google value). Absent that, a new
 * business row is always created -- secondary phone/domain matches are
 * flag-only (duplicate_warning on search_businesses), never a merge.
 *
 * isTest only ever applies to a NEWLY created business row. A reused
 * (google_place_id-matched) business keeps whatever is_test value it
 * already has -- buildUpdatePayload deliberately never sets is_test,
 * so an exploratory/test search can never flip an existing real lead
 * to test, and conversely a production search reusing a business that
 * happens to be marked test can never un-flip it either.
 */
async function importOnePlace(
  supabase: SupabaseServiceRoleClient,
  place: PlacesSearchResultItem,
  isTest: boolean,
): Promise<ImportOnePlaceResult> {
  const fields = extractPlaceFields(place);

  const { data: existing, error: lookupError } = await supabase
    .from("businesses")
    .select("id")
    .eq("google_place_id", fields.googlePlaceId)
    .maybeSingle();

  if (lookupError) {
    console.error("[importOnePlace] google_place_id lookup failed:", lookupError);
    throw new Error("Lookup failed during import.");
  }

  if (existing) {
    const updatePayload = buildUpdatePayload(fields);
    const { error: updateError } = await supabase
      .from("businesses")
      .update(updatePayload)
      .eq("id", existing.id);
    if (updateError) {
      console.error("[importOnePlace] businesses update failed:", updateError);
      throw new Error("Update failed during import.");
    }

    const hasWebsite = await ensureWebsiteRow(supabase, existing.id, fields.websiteUri);
    return { businessId: existing.id, isNew: false, hasWebsite, duplicateWarning: null };
  }

  const duplicateWarning = await checkSecondaryMatch(supabase, fields);

  const insertPayload: BusinessInsert = {
    google_place_id: fields.googlePlaceId,
    name: fields.name,
    city: fields.city,
    state: fields.state,
    zip: fields.zip,
    address: fields.address,
    lat: fields.lat,
    lng: fields.lng,
    phone: fields.phone,
    phone_normalized: fields.phoneNormalized,
    google_rating: fields.rating,
    google_review_count: fields.reviewCount,
    google_maps_url: fields.googleMapsUrl,
    opening_hours: fields.openingHours as unknown as Json,
    business_status: fields.businessStatus,
    primary_category: fields.primaryCategory,
    categories: fields.categories,
    source: "google_places",
    is_test: isTest,
    last_places_sync_at: new Date().toISOString(),
  };

  const { data: created, error: insertError } = await supabase
    .from("businesses")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError || !created) {
    console.error("[importOnePlace] businesses insert failed:", insertError);
    throw new Error("Insert failed during import.");
  }

  const hasWebsite = await ensureWebsiteRow(supabase, created.id, fields.websiteUri);
  return { businessId: created.id, isNew: true, hasWebsite, duplicateWarning };
}

/** Only includes non-null/non-blank fields, so a reused row's existing manual data is never overwritten with a blank Google value. */
function buildUpdatePayload(fields: ExtractedPlaceFields): BusinessUpdate {
  const payload: BusinessUpdate = {
    last_places_sync_at: new Date().toISOString(),
  };

  if (fields.name) payload.name = fields.name;
  if (fields.city) payload.city = fields.city;
  if (fields.state) payload.state = fields.state;
  if (fields.zip) payload.zip = fields.zip;
  if (fields.address) payload.address = fields.address;
  if (fields.lat !== null) payload.lat = fields.lat;
  if (fields.lng !== null) payload.lng = fields.lng;
  if (fields.phone) payload.phone = fields.phone;
  if (fields.phoneNormalized) payload.phone_normalized = fields.phoneNormalized;
  if (fields.rating !== null) payload.google_rating = fields.rating;
  if (fields.reviewCount !== null) payload.google_review_count = fields.reviewCount;
  if (fields.googleMapsUrl) payload.google_maps_url = fields.googleMapsUrl;
  if (fields.openingHours) payload.opening_hours = fields.openingHours as unknown as Json;
  if (fields.businessStatus) payload.business_status = fields.businessStatus;
  if (fields.primaryCategory) payload.primary_category = fields.primaryCategory;
  if (fields.categories && fields.categories.length > 0) payload.categories = fields.categories;

  return payload;
}

/**
 * Creates a websites row for a newly-imported business, syntactic
 * normalization only -- no reachability check, no network request.
 * All reachability fields are left null; they are populated later,
 * only when a queued basic audit actually runs (see run-audit.ts).
 * Never overwrites an existing websites row.
 */
async function ensureWebsiteRow(
  supabase: SupabaseServiceRoleClient,
  businessId: string,
  websiteUrl: string | null,
): Promise<boolean> {
  const { data: existingWebsite, error: lookupError } = await supabase
    .from("websites")
    .select("id")
    .eq("business_id", businessId)
    .maybeSingle();

  if (lookupError) {
    console.error("[ensureWebsiteRow] lookup failed:", lookupError);
    throw new Error("Website lookup failed during import.");
  }

  if (existingWebsite) {
    return true;
  }

  if (!websiteUrl) {
    return false;
  }

  let normalized;
  try {
    normalized = parseAndNormalizeInputUrl(websiteUrl);
  } catch (err) {
    if (err instanceof InvalidUrlError) {
      console.error("[ensureWebsiteRow] invalid Google-supplied URL:", websiteUrl);
      return false;
    }
    throw err;
  }

  const { error: insertError } = await supabase.from("websites").insert({
    business_id: businessId,
    input_url: websiteUrl,
    root_domain: normalized.rootDomain,
  });

  if (insertError) {
    console.error("[ensureWebsiteRow] insert failed:", insertError);
    throw new Error("Website insert failed during import.");
  }

  return true;
}

/**
 * Flag-only secondary match: normalized phone or website root domain
 * equality against an existing business. Never merges -- the caller
 * always creates a new row regardless of this result; the returned
 * string is stored as search_businesses.duplicate_warning for manual
 * human review.
 */
async function checkSecondaryMatch(
  supabase: SupabaseServiceRoleClient,
  fields: ExtractedPlaceFields,
): Promise<string | null> {
  if (fields.phoneNormalized) {
    const { data: phoneMatch } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("phone_normalized", fields.phoneNormalized)
      .limit(1)
      .maybeSingle();

    if (phoneMatch) {
      return `Possible duplicate: phone number matches existing business "${phoneMatch.name}".`;
    }
  }

  if (fields.websiteUri) {
    let rootDomain: string | null = null;
    try {
      rootDomain = parseAndNormalizeInputUrl(fields.websiteUri).rootDomain;
    } catch {
      rootDomain = null;
    }

    if (rootDomain) {
      const { data: domainMatch } = await supabase
        .from("websites")
        .select("business_id")
        .eq("root_domain", rootDomain)
        .limit(1)
        .maybeSingle();

      if (domainMatch) {
        const { data: matchedBusiness } = await supabase
          .from("businesses")
          .select("name")
          .eq("id", domainMatch.business_id)
          .maybeSingle();

        if (matchedBusiness) {
          return `Possible duplicate: website domain matches existing business "${matchedBusiness.name}".`;
        }
      }
    }
  }

  return null;
}
