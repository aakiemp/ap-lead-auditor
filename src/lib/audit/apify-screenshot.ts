import "server-only";

const APIFY_API_BASE = "https://api.apify.com/v2";
// Apify Actor run timeout, in seconds, sent via the `timeout` query
// parameter on run-sync-get-dataset-items (confirmed against Apify's
// official API reference — not guessed; this endpoint hard-caps any
// run at 300s regardless, returning its own 408 past that). Both
// screenshot runs previously failed in production because the old
// 55s value was too short for the actor to complete a full-page
// capture; raised to 120s.
const ACTOR_TIMEOUT_SECONDS = 120;
// App-side abort for the request wrapping that Actor run. Kept
// deliberately longer than ACTOR_TIMEOUT_SECONDS so Apify's own
// timeout response has time to arrive before our fetch aborts first.
const RUN_TIMEOUT_MS = 135000;
const IMAGE_FETCH_TIMEOUT_MS = 20000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class ApifyScreenshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyScreenshotError";
  }
}

export interface CapturedImage {
  bytes: Uint8Array;
  contentType: "image/png";
}

interface CaptureOptions {
  url: string;
  viewportWidth: number;
  actorId: string;
  apiToken: string;
}

/**
 * Runs the apify/screenshot-url actor synchronously for one viewport
 * width, then fetches the resulting image. The API token is sent only
 * via the Authorization header — never as a query string, and never
 * included in any thrown error message or log line.
 *
 * The actor's real input schema (confirmed against its build's
 * inputSchema, not guessed) takes `urls` as an array of {url}
 * objects and requires waitUntil/delay/viewportWidth. It has no
 * height input at all — this actor always captures the page's full
 * scrollable height at the given width, which is exactly the
 * "full-page" behavior this project wants, so there is nothing extra
 * to configure for that. `scrollToBottom: true` is set so lazy-loaded
 * content has a chance to render before the screenshot is taken.
 *
 * Only image/png is accepted. Any other content type (e.g. JPEG) is
 * treated as an unsupported response and rejected rather than stored
 * under a mismatched extension — see CLAUDE.md for why.
 */
export async function captureScreenshot(options: CaptureOptions): Promise<CapturedImage> {
  const runUrl = `${APIFY_API_BASE}/acts/${options.actorId}/run-sync-get-dataset-items?timeout=${ACTOR_TIMEOUT_SECONDS}`;

  let response: Response;
  try {
    response = await fetch(runUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        urls: [{ url: options.url }],
        format: "png",
        // "load" previously hung indefinitely on pages with a slow or
        // persistent third-party embed (Google Maps iframe, review
        // widget, etc.) that never let the load event fire, consuming
        // the full Actor timeout with zero crawl progress. "domcontentloaded"
        // is an actor-schema-valid value that only waits for the HTML
        // document itself to finish parsing, not every subresource.
        waitUntil: "domcontentloaded",
        // Raised from 1000ms to compensate: domcontentloaded fires
        // before images/iframes paint, so a slightly longer fixed
        // delay gives visible content a chance to render first.
        delay: 3000,
        viewportWidth: options.viewportWidth,
        scrollToBottom: true,
      }),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });
  } catch {
    throw new ApifyScreenshotError("Apify actor run request failed or timed out.");
  }

  if (!response.ok) {
    throw new ApifyScreenshotError(`Apify actor run failed with status ${response.status}.`);
  }

  let items: unknown;
  try {
    items = await response.json();
  } catch {
    throw new ApifyScreenshotError("Apify actor run returned an unreadable response.");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApifyScreenshotError("Apify actor run returned no dataset items.");
  }

  const first = items[0] as Record<string, unknown>;
  const screenshotUrl = first.screenshotUrl;

  if (typeof screenshotUrl !== "string") {
    throw new ApifyScreenshotError("Apify actor run did not return a screenshotUrl.");
  }

  let parsed: URL;
  try {
    parsed = new URL(screenshotUrl);
  } catch {
    throw new ApifyScreenshotError("Apify returned an invalid screenshot URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new ApifyScreenshotError("Apify returned a non-HTTPS screenshot URL.");
  }

  return fetchImage(parsed);
}

async function fetchImage(url: URL): Promise<CapturedImage> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  } catch {
    throw new ApifyScreenshotError("Could not fetch the screenshot image.");
  }

  if (!response.ok) {
    throw new ApifyScreenshotError(`Screenshot image fetch failed with status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();

  if (normalizedType !== "image/png") {
    throw new ApifyScreenshotError(
      `Unsupported screenshot content type: ${normalizedType || "unknown"}.`,
    );
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_IMAGE_BYTES) {
    throw new ApifyScreenshotError("Screenshot image exceeds the maximum allowed size.");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new ApifyScreenshotError("Screenshot image exceeds the maximum allowed size.");
  }

  return { bytes: new Uint8Array(buffer), contentType: "image/png" };
}
