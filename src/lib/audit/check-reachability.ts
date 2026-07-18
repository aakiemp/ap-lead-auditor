import { checkUrlIsSafe } from "@/lib/security/ssrf-guard";

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

export interface ReachabilityResult {
  isReachable: boolean;
  finalUrl: string | null;
  httpStatus: number | null;
  httpsEnabled: boolean | null;
  redirectCount: number;
  redirectChain: string[];
  httpToHttpsRedirect: boolean;
  failureReason: string | null;
}

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 8000;

function unreachable(redirectChain: string[], failureReason: string): ReachabilityResult {
  return {
    isReachable: false,
    finalUrl: null,
    httpStatus: null,
    httpsEnabled: null,
    redirectCount: redirectChain.length,
    redirectChain,
    httpToHttpsRedirect: false,
    failureReason,
  };
}

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
    // best-effort cleanup only — never let this affect the result
  }
}

/**
 * Performs a bounded, SSRF-guarded reachability check against a
 * website URL. Follows redirects manually (never automatically), so
 * every hop is re-validated by the SSRF guard before being followed.
 * Never reads or stores a response body. Throws SsrfBlockedError if
 * the start URL or any redirect target is blocked — callers must treat
 * that as a hard validation failure, not a normal "unreachable" result.
 */
export async function checkReachability(startUrl: URL): Promise<ReachabilityResult> {
  const redirectChain: string[] = [];
  const visited = new Set<string>([startUrl.toString()]);
  const originalWasHttp = startUrl.protocol === "http:";
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  let current = startUrl;

  while (true) {
    const guard = await checkUrlIsSafe(current);
    if (guard.status === "blocked") {
      throw new SsrfBlockedError(guard.reason);
    }
    if (guard.status === "dns_failure") {
      return unreachable(redirectChain, "dns_failure");
    }

    let response: Response;
    try {
      response = await fetch(current, { method: "HEAD", redirect: "manual", signal });
    } catch {
      try {
        response = await fetch(current, { method: "GET", redirect: "manual", signal });
      } catch (getErr) {
        return unreachable(redirectChain, classifyFetchError(getErr));
      }
    }

    const isRedirect =
      response.status >= 300 && response.status < 400 && response.headers.has("location");

    await discardBody(response);

    if (!isRedirect) {
      return {
        isReachable: true,
        finalUrl: current.toString(),
        httpStatus: response.status,
        httpsEnabled: current.protocol === "https:",
        redirectCount: redirectChain.length,
        redirectChain,
        httpToHttpsRedirect: originalWasHttp && current.protocol === "https:",
        failureReason: null,
      };
    }

    if (redirectChain.length >= MAX_REDIRECTS) {
      return unreachable(redirectChain, "too_many_redirects");
    }

    let next: URL;
    try {
      next = new URL(response.headers.get("location") as string, current);
    } catch {
      return unreachable(redirectChain, "invalid_redirect_target");
    }

    if (next.protocol !== "http:" && next.protocol !== "https:") {
      return unreachable(redirectChain, "invalid_redirect_target");
    }

    const key = next.toString();
    if (visited.has(key)) {
      return unreachable(redirectChain, "redirect_loop");
    }
    visited.add(key);
    redirectChain.push(key);
    current = next;
  }
}
