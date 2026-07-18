import "server-only";

import { checkUrlIsSafe } from "@/lib/security/ssrf-guard";

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

export class HtmlFetchError extends Error {
  reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = "HtmlFetchError";
    this.reason = reason;
  }
}

export interface FetchedHtml {
  html: string;
  finalUrl: string;
}

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

function classifyFetchError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
    const cause = (err as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns_failure";
    if (code === "ECONNREFUSED") return "connection_refused";
    if (code === "ECONNRESET") return "connection_reset";
    if (typeof code === "string" && (code.startsWith("ERR_TLS") || code.startsWith("CERT_"))) {
      return "tls_error";
    }
  }
  return "connection_failed";
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // best-effort cleanup only
  }
}

/**
 * Fetches the HTML at a URL for homepage scanning. Follows redirects
 * manually (never automatically), so every hop is re-validated by the
 * SSRF guard before being followed — same pattern as
 * check-reachability.ts, but this one actually reads the response
 * body (bounded to 2MB) and requires an HTML-compatible content type
 * before doing so. This is a plain text fetch, never a browser — no
 * page scripts are ever executed.
 *
 * Throws SsrfBlockedError if the start URL or any redirect target is
 * blocked (a hard validation failure, not a normal scan failure).
 * Throws HtmlFetchError for every other failure mode (timeout, DNS,
 * non-HTML content type, oversized response, too many redirects,
 * redirect loop) — callers should treat all of these as "scan did not
 * complete," never as something to retry automatically.
 */
export async function fetchHomepageHtml(startUrl: URL): Promise<FetchedHtml> {
  const redirectChain: string[] = [];
  const visited = new Set<string>([startUrl.toString()]);
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  let current = startUrl;

  while (true) {
    const guard = await checkUrlIsSafe(current);
    if (guard.status === "blocked") {
      throw new SsrfBlockedError(guard.reason);
    }
    if (guard.status === "dns_failure") {
      throw new HtmlFetchError("DNS resolution failed.", "dns_failure");
    }

    let response: Response;
    try {
      response = await fetch(current, { method: "GET", redirect: "manual", signal });
    } catch (err) {
      throw new HtmlFetchError("Request failed or timed out.", classifyFetchError(err));
    }

    const isRedirect =
      response.status >= 300 && response.status < 400 && response.headers.has("location");

    if (isRedirect) {
      await discardBody(response);

      if (redirectChain.length >= MAX_REDIRECTS) {
        throw new HtmlFetchError("Too many redirects.", "too_many_redirects");
      }

      let next: URL;
      try {
        next = new URL(response.headers.get("location") as string, current);
      } catch {
        throw new HtmlFetchError("Invalid redirect target.", "invalid_redirect_target");
      }

      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new HtmlFetchError("Invalid redirect target.", "invalid_redirect_target");
      }

      const key = next.toString();
      if (visited.has(key)) {
        throw new HtmlFetchError("Redirect loop detected.", "redirect_loop");
      }
      visited.add(key);
      redirectChain.push(key);
      current = next;
      continue;
    }

    if (!response.ok) {
      await discardBody(response);
      throw new HtmlFetchError(`Unexpected status ${response.status}.`, "http_error");
    }

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
      await discardBody(response);
      throw new HtmlFetchError(
        `Unsupported content type: ${contentType || "unknown"}.`,
        "unsupported_content_type",
      );
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_HTML_BYTES) {
      await discardBody(response);
      throw new HtmlFetchError("Response exceeds the maximum allowed size.", "too_large");
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_HTML_BYTES) {
      throw new HtmlFetchError("Response exceeds the maximum allowed size.", "too_large");
    }

    const html = new TextDecoder("utf-8").decode(buffer);
    return { html, finalUrl: current.toString() };
  }
}
