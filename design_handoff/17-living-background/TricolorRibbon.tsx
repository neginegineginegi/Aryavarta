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
const SHAPE = {
  wide:    { th: 120, amp: 1,   ss: 0.4, tilt: -40 },
  sharp:   { th: 18,  amp: 0.8, ss: 1,   tilt: -34, fade: true },
  soft:    { th: 88,  amp: 0.9, ss: 0.4, tilt: -34 },
  reverse: { th: 76,  amp: 0.9, ss: 0.4, tilt: -30, flip: true },
  faq:     { th: 70,  amp: 0.8, ss: 0.4, tilt: -28, fade: true },
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
