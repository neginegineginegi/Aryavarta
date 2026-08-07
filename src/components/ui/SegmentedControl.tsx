"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Segmented control with a gliding indicator.
 *
 * PLACEHOLDER: the handoff's SegmentedControl.tsx was not present in any of
 * the uploaded design bundles (14-evolution-roadmap/ contains only README.md,
 * and no .tsx file appears anywhere in them). This implements the rules that
 * came with the request so the control works now; replace this file wholesale
 * when the real one arrives.
 *
 * The rules, and why each one matters:
 *
 * 1. ONE PERSISTENT INDICATOR ELEMENT. A single absolutely-positioned node
 *    whose left/width are animated. Render an indicator per option, or
 *    recreate it per state, and there is nothing continuous for CSS to
 *    interpolate: you get a cut, not a glide.
 *
 * 2. MEASURED IN useLayoutEffect, AFTER FONTS LOAD. The buttons are set in
 *    IBM Plex Mono with 0.1em tracking and the project loads fonts with
 *    `display: swap`, so their widths change when the webfont replaces the
 *    fallback. Measuring once on mount pins the indicator to fallback-font
 *    widths and it stays visibly wrong until something forces a resize.
 *    useLayoutEffect rather than useEffect so the first paint is already
 *    correct, and document.fonts.ready to re-measure after the swap.
 *
 * 3. NEVER REMOUNTED ON TOGGLE. The indicator lives outside anything
 *    conditional, and options keep stable keys. A remount resets the
 *    transition's starting position and the glide is lost.
 */

export type Segment<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  ariaLabel,
}: {
  segments: ReadonlyArray<Segment<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef(new Map<T, HTMLButtonElement>());
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const el = btnRefs.current.get(value);
    if (!el) return;
    setBox({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);

  // Rule 2: before paint, so the indicator is never briefly wrong.
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    // Re-measure once the webfont swaps in and the labels change width.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    // And on any layout change: the control sits in a responsive card.
    const ro = new ResizeObserver(() => measure());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [measure]);

  return (
    <div ref={wrapRef} className="seg" role="tablist" aria-label={ariaLabel}>
      {/* Rule 1 and 3: one node, rendered unconditionally, never keyed by
          the active value. Hidden until measured so it cannot flash at
          zero width on the first frame. */}
      <span
        className="seg-ind"
        aria-hidden
        style={
          box ? { left: box.left, width: box.width } : { opacity: 0, width: 0 }
        }
      />
      {segments.map((s) => (
        <button
          key={s.value}
          ref={(el) => {
            if (el) btnRefs.current.set(s.value, el);
            else btnRefs.current.delete(s.value);
          }}
          type="button"
          role="tab"
          aria-selected={s.value === value}
          className={s.value === value ? "on" : undefined}
          onClick={() => onChange(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
