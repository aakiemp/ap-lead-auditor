import "server-only";

const PAGESPEED_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [2000, 5000];

export class PageSpeedError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "PageSpeedError";
    this.retryable = retryable;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestUrl(targetUrl: string, apiKey: string): string {
  const params = new URLSearchParams();
  params.set("url", targetUrl);
  params.set("key", apiKey);
  params.set("strategy", "mobile");
  for (const category of ["PERFORMANCE", "ACCESSIBILITY", "SEO", "BEST_PRACTICES"]) {
    params.append("category", category);
  }
  return `${PAGESPEED_ENDPOINT}?${params.toString()}`;
}

/**
 * Calls the Google PageSpeed Insights API for the mobile strategy.
 * Retries up to MAX_RETRIES times (with backoff) on transient failures
 * (network errors, timeouts, 5xx) — never on 4xx, since retrying a bad
 * request/key/quota error won't help. Returns the fully untouched JSON
 * response on success; throws PageSpeedError (or the underlying fetch
 * error) after retries are exhausted. Never logs or includes the API
 * key in any thrown error message.
 */
export async function fetchMobilePageSpeed(targetUrl: string, apiKey: string): Promise<unknown> {
  const requestUrl = buildRequestUrl(targetUrl, apiKey);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(requestUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });

      if (response.ok) {
        return (await response.json()) as unknown;
      }

      const retryable = response.status >= 500;
      const error = new PageSpeedError(`PageSpeed request failed with status ${response.status}`, retryable);
      if (!retryable) throw error;
      lastError = error;
    } catch (err) {
      if (err instanceof PageSpeedError && !err.retryable) throw err;
      lastError = err;
    }

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError instanceof Error ? lastError : new PageSpeedError("PageSpeed request failed", true);
}
