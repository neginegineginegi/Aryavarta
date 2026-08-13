"use client";

import { useEffect, useRef } from "react";

import { registerGlow, registerMagnet } from "@/lib/cursor-field";

/**
 * Refs that register with the cursor field on mount and unregister on
 * unmount. Nothing here causes a render: the engine writes styles directly,
 * and these hooks exist only to hand it a node and take it back.
 */

export function useMagnetic<T extends HTMLElement = HTMLElement>(
  opts: { sticky?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const sticky = opts.sticky ?? false;
  useEffect(() => {
    if (!ref.current) return;
    return registerMagnet(ref.current, { sticky });
  }, [sticky]);
  return ref;
}

export function useGlow<T extends HTMLElement = HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    return registerGlow(ref.current);
  }, [enabled]);
  return ref;
}
