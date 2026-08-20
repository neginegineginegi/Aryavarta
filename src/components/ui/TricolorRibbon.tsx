"use client";

import { useEffect, useRef } from "react";

import { registerRibbon } from "@/lib/living-field";

/**
 * A tricolor band that reacts to the pointer, the scroll and taps.
 *
 * Drop-in replacement for `<div aria-hidden className="prism prism-wide" />`:
 * the canvas keeps the same class, so position, blur and opacity still come
 * from globals.css, and the CSS gradient stays as the no-JS fallback until
 * the engine takes over painting.
 *
 * The bands are TALLER than the divs they replace, because a wave needs
 * headroom — the geometry is in .ribbon-* (see globals-additions.css).
 */
/**
 * `amp` is set against each variant's BLUR, not in the abstract.
 *
 * The blurs here span 6px to 42px, a sevenfold range, and a wave is only
 * visible in proportion to the blur it is drawn through. So the amplitude that
 * makes .ribbon-wide (blur 42) drift at the edge of perception would make
 * .ribbon-sharp (blur 6) whip about: sharp sits at 0.35 where the soft bands
 * sit near 1, and the two end up moving by a similar fraction of their own
 * blur radius. The resting floor itself lives in living-field.ts.
 */
const SHAPE = {
  wide:    { th: 120, amp: 1,    ss: 0.4, tilt: -40 },
  sharp:   { th: 18,  amp: 0.35, ss: 1,   tilt: -34, fade: true },
  soft:    { th: 88,  amp: 0.9,  ss: 0.4, tilt: -34 },
  reverse: { th: 76,  amp: 0.9,  ss: 0.4, tilt: -30, flip: true },
  faq:     { th: 70,  amp: 0.8,  ss: 0.4, tilt: -28, fade: true },
} as const;

export function TricolorRibbon({ variant }: { variant: keyof typeof SHAPE }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerRibbon(el, SHAPE[variant]);
  }, [variant]);
  return <canvas ref={ref} aria-hidden className={`prism ribbon ribbon-${variant}`} />;
}
