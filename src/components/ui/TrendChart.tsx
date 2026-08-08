"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * SVG line chart for a yearly series, now living rather than static.
 *
 * The base render is unchanged from the server-only version: line, points,
 * baseline, a min to max caption. What the interaction handoff adds is the
 * ability to ask the chart a question. Moving a pointer across it (or tapping,
 * or focusing it and using the arrow keys) picks the nearest point and swaps
 * the caption for that point's readout: year, value, and whatever note the
 * caller attached, which the Development Lens uses for the value's source and
 * reporting period. The readout lives in the caption row rather than a
 * floating tooltip, so nothing clips inside table cells and touch behaves
 * exactly like hover.
 *
 * This is the one visualization primitive reused everywhere, so the upgrade
 * lands on the state pages, the indicator pages and Compare at once.
 */

export type TrendPoint = {
  year: number;
  value: number;
  /** Shown in the readout when this point is selected, e.g. "NSO · 2023-24". */
  note?: string;
};

export function TrendChart({
  points,
  width = 260,
  height = 64,
  ariaLabel,
  unit,
  href,
}: {
  points: TrendPoint[];
  width?: number;
  height?: number;
  ariaLabel?: string;
  /** Unit suffix for the readout, e.g. "per 1000 persons". */
  unit?: string;
  /** When set, the whole chart links to the expanded view (indicator page). */
  href?: string;
}) {
  const [sel, setSel] = useState<number | null>(null);

  const clean = useMemo(
    () =>
      points
        .filter((p) => Number.isFinite(p.value) && Number.isFinite(p.year))
        .sort((a, b) => a.year - b.year),
    [points],
  );
  if (clean.length < 2) return null;

  const PAD_X = 4;
  const PAD_Y = 8;
  const years = clean.map((p) => p.year);
  const values = clean.map((p) => p.value);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const minX = years[0];
  const maxX = years[years.length - 1];
  const spanY = maxY - minY || 1;
  const spanX = maxX - minX || 1;

  const x = (year: number) => PAD_X + ((year - minX) / spanX) * (width - PAD_X * 2);
  const y = (v: number) => height - PAD_Y - ((v - minY) / spanY) * (height - PAD_Y * 2);
  const path = clean
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const last = clean[clean.length - 1];

  // Group from a thousand, not from ten thousand. The old threshold predated
  // any indicator measured in the thousands, and once capacity series arrived
  // it put "29 - 33,451.9" and "21 - 3018" in adjacent rows of one table.
  // Small values keep two decimals; toLocaleString alone would allow three.
  const fmt = (v: number) =>
    Math.abs(v) >= 1000
      ? v.toLocaleString("en-IN")
      : String(Math.round(v * 100) / 100);

  const active = sel !== null ? clean[sel] : null;

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // The SVG scales with its container; map back into viewBox units first.
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < clean.length; i++) {
      const d = Math.abs(x(clean[i].year) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setSel(best);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setSel((s) => (s === null ? clean.length - 1 : Math.min(clean.length - 1, s + 1)));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSel((s) => (s === null ? clean.length - 1 : Math.max(0, s - 1)));
    } else if (e.key === "Escape") {
      setSel(null);
    }
  }

  const figure = (
    <figure className="inline-block" style={{ width }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block touch-none"
        role="img"
        aria-label={ariaLabel ?? `Trend from ${minX} to ${maxX}`}
        tabIndex={0}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setSel(null)}
        onKeyDown={onKey}
        onBlur={() => setSel(null)}
      >
        <line
          x1={PAD_X}
          y1={height - PAD_Y}
          x2={width - PAD_X}
          y2={height - PAD_Y}
          stroke="var(--color-rule-dark)"
          strokeWidth="1"
        />
        {active && (
          <line
            x1={x(active.year)}
            y1={PAD_Y / 2}
            x2={x(active.year)}
            y2={height - PAD_Y}
            stroke="var(--color-ink-ghost)"
            strokeWidth="1"
          />
        )}
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
        {clean.map((p, i) => (
          <circle
            key={p.year}
            cx={x(p.year)}
            cy={y(p.value)}
            r={i === sel ? 3.2 : 1.8}
            fill="var(--color-accent)"
          />
        ))}
        {!active && (
          <circle cx={x(last.year)} cy={y(last.value)} r="2.6" fill="var(--color-accent)" />
        )}
      </svg>
      {/* One caption row, two states: the series range at rest, the selected
          point's readout while asking. Same height either way, so a table
          never reflows under the pointer. */}
      <figcaption
        className="flex min-h-[1rem] justify-between gap-2 font-mono text-[0.6rem] text-ink-faint"
        aria-live="polite"
      >
        {active ? (
          <>
            <span className="whitespace-nowrap text-ink">
              {active.year} · {fmt(active.value)}
              {unit ? ` ${unit}` : ""}
            </span>
            {active.note && <span className="truncate text-ink-meta">{active.note}</span>}
          </>
        ) : (
          <>
            <span>{minX}</span>
            <span>
              {fmt(minY)} – {fmt(maxY)}
            </span>
            <span>{maxX}</span>
          </>
        )}
      </figcaption>
    </figure>
  );

  if (!href) return figure;
  return (
    <Link
      href={href}
      className="inline-block rounded-sm outline-offset-4"
      aria-label={`${ariaLabel ?? "Trend"}. Open the full series with methodology.`}
    >
      {figure}
    </Link>
  );
}
