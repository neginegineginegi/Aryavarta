"use client";

import { useMagnetic } from "@/lib/use-cursor";

/**
 * अभिलेखः, the one string on the site that is never split into letters.
 *
 * Devanagari letters combine into conjuncts, so per-character spans break the
 * script outright, which is why AutoLetters skips anything containing it. The
 * wordmark answers the cursor a different way, exactly as the handoff
 * prescribes: it drifts toward the pointer and grows under it.
 *
 * The drift writes the standalone `translate` property and the growth writes
 * `transform`, so the two compose instead of one clobbering the other.
 */
export function Wordmark({
  className = "",
  sticky = false,
}: {
  className?: string;
  /** True in the masthead, which is position:sticky and so has no fixed
   *  document position for the engine to cache. */
  sticky?: boolean;
}) {
  const ref = useMagnetic<HTMLSpanElement>({ sticky });
  return (
    <span ref={ref} lang="sa" className={`wordmark font-brand ${className}`}>
      अभिलेखः
    </span>
  );
}
