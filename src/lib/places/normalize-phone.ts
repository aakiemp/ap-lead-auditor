/**
 * Pure phone-number normalization -- no network, no server-only guard.
 *
 * Used both when importing Google Places results and (via a small
 * addition to create-manual-lead.ts) when a business is created
 * manually, so the two paths stay comparable for the secondary
 * duplicate-match check in import-search.ts.
 */
export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let national = digits;
  if (digits.length === 11 && digits.startsWith("1")) {
    national = digits.slice(1);
  }

  if (national.length === 10) {
    return `+1${national}`;
  }

  // Best-effort, non-US/ambiguous format -- never rejected outright.
  return digits;
}
