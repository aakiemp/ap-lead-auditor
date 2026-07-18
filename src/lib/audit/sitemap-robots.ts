import "server-only";

import { checkUrlIsSafe } from "@/lib/security/ssrf-guard";

export interface SitemapRobotsResult {
  sitemapDetected: boolean;
  robotsTxtDetected: boolean;
}

const TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;

/**
 * Independent, best-effort checks for /sitemap.xml and /robots.txt at
 * the audited site's origin. Each check is fully isolated from the
 * other and from the homepage scan — this function never throws; any
 * failure (SSRF block, timeout, non-200, oversized, unreadable)
 * degrades to "not detected" for that resource only.
 */
export async function checkSitemapAndRobots(origin: URL): Promise<SitemapRobotsResult> {
  const [sitemapDetected, robotsTxtDetected] = await Promise.all([
    checkResourceExists(
      new URL("/sitemap.xml", origin),
      (body) => /<urlset|<sitemapindex/i.test(body),
    ),
    checkResourceExists(new URL("/robots.txt", origin), (body) => /user-agent/i.test(body)),
  ]);

  return { sitemapDetected, robotsTxtDetected };
}

async function checkResourceExists(
  startUrl: URL,
  validateBody: (body: string) => boolean,
): Promise<boolean> {
  const visited = new Set<string>([startUrl.toString()]);
  let current = startUrl;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const guard = await checkUrlIsSafe(current);
      if (guard.status !== "safe") return false;

      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const isRedirect =
        response.status >= 300 && response.status < 400 && response.headers.has("location");

      if (isRedirect) {
        await response.body?.cancel().catch(() => {});

        if (hop === MAX_REDIRECTS) return false;

        const location = response.headers.get("location");
        if (!location) return false;

        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return false;
        }
        if (next.protocol !== "http:" && next.protocol !== "https:") return false;

        const key = next.toString();
        if (visited.has(key)) return false;
        visited.add(key);
        current = next;
        continue;
      }

      if (!response.ok) return false;

      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader && Number(contentLengthHeader) > MAX_BYTES) return false;

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES || buffer.byteLength === 0) return false;

      const text = new TextDecoder("utf-8").decode(buffer);
      return validateBody(text);
    }
    return false;
  } catch {
    return false;
  }
}
