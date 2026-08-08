"use client";

import { useEffect, useRef } from "react";

import {
  registerChars,
  registerGlow,
  registerMagnet,
  type CursorTextMode,
} from "@/lib/cursor-field";

/**
 * Refs that register with the cursor field on mount and unregister on
 * unmount. Nothing here causes a render: the engine writes styles directly,
 * and these hooks exist only to hand it a node and take it back.
 */

export function useCursorText<T extends HTMLElement = HTMLElement>(mode: CursorTextMode = "chars") {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Web fonts change glyph widths, so measuring before they land caches
    // centres for the fallback face. Register now so the effect works
    // immediately, then re-register once the real face arrives. Both faces
    // are variable (see layout.tsx); a pinned weight array would kill the
    // weight gain entirely.
    let stop = registerChars(node, mode);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (cancelled) return;
      stop();
      stop = registerChars(node, mode);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [mode]);
  return ref;
}

export function useMagnetic<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!ref.current) return;
    return registerMagnet(ref.current);
  }, []);
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
