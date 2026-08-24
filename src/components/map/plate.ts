import type React from "react";

/**
 * The atlas-plate fill model, shared by the state and Union maps.
 *
 * The stored party color is a fact and never changes; what renders is
 * typography derived from it at render time. Every surface carries two
 * custom properties read by .map-state in globals.css: the resting fill
 * (canonical color mixed toward the paper by --map-tone) and the live fill
 * (the full canonical color, restored on hover and focus). Patterned
 * absences set both to their pattern, so absence never gains color under
 * attention. color-mix() does not parse in an SVG fill attribute, which is
 * why fills travel as properties rather than attributes.
 */
export type Fill = { rest: string; live: string };

export const toned = (color: string): Fill => ({
  rest: `color-mix(in oklab, ${color} var(--map-tone), var(--color-paper))`,
  live: color,
});

export const patterned = (url: string): Fill => ({ rest: url, live: url });

export const fillStyle = (f: Fill | undefined): React.CSSProperties =>
  ({ "--map-fill-rest": f?.rest, "--map-fill-live": f?.live }) as React.CSSProperties;

/** The legend swatch for a toned color, matching the map by construction. */
export const tonedSwatch = (color: string): React.CSSProperties => ({
  backgroundColor: `color-mix(in oklab, ${color} var(--map-tone), var(--color-paper))`,
});

/** Legend swatch for "not yet formed / n.a.": the diagonal hatch. */
export const NA_SWATCH: React.CSSProperties = {
  background:
    "repeating-linear-gradient(45deg, var(--color-paper-sunken) 0 2px, var(--color-rule-dark) 2px 3px)",
};

/** Legend swatch for a record gap: sunken paper, quietly stippled. */
export const NODATA_SWATCH: React.CSSProperties = {
  backgroundColor: "var(--color-paper-sunken)",
  backgroundImage:
    "radial-gradient(circle at 1.5px 1.5px, var(--color-rule-dark) 0.8px, transparent 1px)",
  backgroundSize: "5px 5px",
};
