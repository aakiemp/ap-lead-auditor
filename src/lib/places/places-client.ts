import "server-only";

/**
 * Google Places API (New) -- Text Search only.
 *
 * No Nearby Search, no Geocoding, no separate Place Details calls --
 * everything this app needs comes back on the Text Search response
 * itself via the field mask below (see CLAUDE.md for why: Details
 * calls would double the Enterprise-tier field cost per business for
 * no additional data this app uses).
 *
 * The API key is sent only via the X-Goog-Api-Key header -- never in
 * the URL, never logged, never stored, never returned to the client.
 */

const PLACES_API_BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 15_000;

// Verbatim, comma-separated, no spaces -- matches the approved field
// mask exactly. Do not reformat this into a multi-line join; Google
// rejects a mask containing whitespace.
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.regularOpeningHours,places.businessStatus,places.primaryType,places.primaryTypeDisplayName,places.types,nextPageToken";

export class PlacesApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacesApiError";
  }
}

export interface PlacesAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface PlacesOpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
  [key: string]: unknown;
}

export interface PlacesSearchResultItem {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: PlacesAddressComponent[];
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  regularOpeningHours?: PlacesOpeningHours;
  businessStatus?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
}

export interface TextSearchPageResult {
  places: PlacesSearchResultItem[];
  nextPageToken: string | null;
}

export interface TextSearchOptions {
  textQuery: string;
  pageSize: number;
  pageToken?: string;
  minRating?: number;
  apiKey: string;
}

export async function searchTextPlaces(
  options: TextSearchOptions,
): Promise<TextSearchPageResult> {
  const body: Record<string, unknown> = {
    textQuery: options.textQuery,
    pageSize: options.pageSize,
  };
  if (options.pageToken) {
    body.pageToken = options.pageToken;
  }
  if (options.minRating !== undefined) {
    body.minRating = options.minRating;
  }

  let response: Response;
  try {
    response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": options.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("Places Text Search request failed:", err);
    throw new PlacesApiError("Could not reach Google Places API.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      // ignore
    }
    console.error(
      `Places Text Search returned ${response.status}:`,
      detail.slice(0, 500),
    );
    throw new PlacesApiError(
      `Google Places API request failed (status ${response.status}).`,
    );
  }

  let data: { places?: PlacesSearchResultItem[]; nextPageToken?: string };
  try {
    data = await response.json();
  } catch (err) {
    console.error("Places Text Search returned invalid JSON:", err);
    throw new PlacesApiError("Google Places API returned an unreadable response.");
  }

  return {
    places: data.places ?? [],
    nextPageToken: data.nextPageToken ?? null,
  };
}
