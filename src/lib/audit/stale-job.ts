/**
 * Informational-only staleness check for the Phase 9 queue dashboard:
 * a basic audit job sitting in `auditing` with a `claimed_at` older
 * than the threshold gets a "Possibly stale" warning shown next to it
 * (see queue/page.tsx). This never resets or reruns anything — Phase 9
 * deliberately has no automatic recovery for a stuck job.
 */
export function isStaleAuditingJob(
  status: string,
  claimedAt: string | null,
  thresholdMs: number,
): boolean {
  if (status !== "auditing" || !claimedAt) return false;
  return Date.now() - new Date(claimedAt).getTime() > thresholdMs;
}
