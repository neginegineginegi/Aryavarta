"use client";

import { useEffect, useRef } from "react";

import { registerRibbon } from "@/lib/living-field";

/**
 * A tricolor band that reacts to the pointer, the scroll and taps.
 *
 * Replaces one decorative `.prism` div. The canvas carries the same CSS
 * gradient as its background, so with JavaScript off the band still shows
 * exactly what the prism showed; the engine clears that background only once
 * it has something of its own to paint. The CSS blur is unchanged, so at rest
 * the bands look as they always did.
 *
 * Carries its own "use client" so the page section around it stays a server
 * component.
 */
export function TricolorRibbon({
  variant,
}: {
  variant: "wide" | "sharp" | "soft" | "reverse" | "faq";
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.dataset.live = "true";
    const stop = registerRibbon(node, variant);
    return () => {
      stop();
      delete node.dataset.live;
    };
  }, [variant]);

  return <canvas ref={ref} aria-hidden className={`ribbon ribbon-${variant}`} />;
}
