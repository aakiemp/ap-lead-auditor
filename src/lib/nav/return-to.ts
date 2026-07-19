const FALLBACK = "/leads";

/**
 * Validates a `returnTo` query value before it's ever used as a Link
 * href or redirect target — used to preserve /leads's filters across
 * a "back" navigation from the lead-detail page, without resorting to
 * document.referrer (unreliable, and not usable from a Server
 * Component anyway).
 *
 * Only a relative, same-origin application path is accepted:
 * - must start with a single "/" (a real relative path)
 * - a bare "//..." is rejected — browsers resolve a protocol-relative
 *   URL like this against the current scheme, so it can point at an
 *   external host despite "starting with a slash"
 * - anything else (absolute http://, https://, mailto:, javascript:,
 *   a bare string with no leading slash, empty/missing) falls back to
 *   /leads rather than being trusted
 */
export function validateReturnTo(value: string | null | undefined): string {
  if (!value) return FALLBACK;
  if (!value.startsWith("/")) return FALLBACK;
  if (value.startsWith("//")) return FALLBACK;
  return value;
}
