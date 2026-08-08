"use client";

import type { ElementType } from "react";

import { useCursorText } from "@/lib/use-cursor";
import type { CursorTextMode } from "@/lib/cursor-field";

/**
 * Splits a string into per-word and per-letter spans so the cursor field has
 * something to move. The split is deterministic, so the server and the client
 * produce identical markup and React never complains about hydration.
 *
 * mode="chars" lifts a letter AND thickens it, which changes its advance
 * width. Use it only on single-line display text. On anything that can wrap,
 * a weight change re-breaks the line under the pointer, so use mode="ink",
 * which lifts and tints and touches nothing that affects layout. Mono labels
 * are always "ink": IBM Plex Mono is pinned to 400/500 in layout.tsx and has
 * no variable weight axis to interpolate.
 */
export function CursorText({
  children,
  mode = "chars",
  as: Tag = "span",
  className,
  ...rest
}: {
  children: string;
  mode?: CursorTextMode;
  as?: ElementType;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  const ref = useCursorText<HTMLElement>(mode);
  // Keep the separators: splitting on a captured group preserves the exact
  // spacing, so copied text and screen readers read the original string.
  const parts = children.split(/(\s+)/);

  return (
    <Tag ref={ref} className={className} data-cx={mode} {...rest}>
      {/* One accessible copy of the real string; the letter soup is hidden
          from assistive tech so it is never spelled out one glyph at a time. */}
      <span className="sr-only">{children}</span>
      <span aria-hidden="true">
        {parts.map((part, i) =>
          /^\s+$/.test(part) ? (
            <span key={i}>{part}</span>
          ) : (
            <span key={i} className="cx-word">
              {Array.from(part).map((ch, j) => (
                <span key={j} className="cx-char">
                  {ch}
                </span>
              ))}
            </span>
          ),
        )}
      </span>
    </Tag>
  );
}
