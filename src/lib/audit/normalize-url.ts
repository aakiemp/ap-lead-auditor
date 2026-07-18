import { isIP } from "node:net";

import { getDomain } from "tldts";

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUrlError";
  }
}

export interface NormalizedUrlInput {
  url: URL;
  rootDomain: string | null;
}

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
];

// WHATWG URL parsing is lenient about what it accepts as a hostname
// (e.g. "ht!tp://not a url" parses "ht!tp" as a hostname without
// throwing). This pattern rejects anything that isn't a plausible DNS
// label sequence, so malformed input is caught here rather than
// silently becoming a "valid" URL with a nonsense host.
const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i;

function isPlausibleHostname(hostname: string): boolean {
  return isIP(hostname) !== 0 || HOSTNAME_PATTERN.test(hostname);
}

/**
 * Parses a raw user-entered website value into a URL. Adds an https://
 * scheme when the user typed a bare domain. Rejects anything that
 * isn't a well-formed http/https URL with a plausible hostname. Does
 * not perform any network request or SSRF check — see
 * check-reachability.ts for that.
 */
export function parseAndNormalizeInputUrl(rawInput: string): NormalizedUrlInput {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new InvalidUrlError("Website URL is required.");
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new InvalidUrlError("Enter a valid website URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidUrlError("Website URL must use http or https.");
  }

  if (!url.hostname || !isPlausibleHostname(url.hostname)) {
    throw new InvalidUrlError("Enter a valid website URL.");
  }

  return { url, rootDomain: getDomain(url.hostname) };
}

/** Strips known tracking parameters from a resolved URL before storage. */
export function stripTrackingParams(url: URL): string {
  const copy = new URL(url.toString());
  for (const param of TRACKING_PARAMS) {
    copy.searchParams.delete(param);
  }
  return copy.toString();
}
