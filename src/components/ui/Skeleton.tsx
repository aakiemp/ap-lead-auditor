/**
 * A single skeleton block. Uses Tailwind's motion-safe: variant so the
 * pulse animation is entirely absent (not just fast) under
 * prefers-reduced-motion, rather than relying only on the global CSS
 * duration override in globals.css. aria-hidden because it conveys no
 * information of its own -- the loading.tsx that renders it is
 * responsible for any accessible "loading" announcement.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-md bg-zinc-200 motion-safe:animate-pulse ${className}`} />;
}
