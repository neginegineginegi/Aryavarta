"use client";

import { useMagnetic } from "@/lib/use-cursor";

/**
 * अभिलेखः, and the one piece of type on the site that answers the pointer.
 *
 * It is a mark rather than something anybody reads a sentence of, so it drifts
 * toward the cursor and grows under it, exactly as the handoff prescribes.
 * Running text does not: words you are reading have to hold still.
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
