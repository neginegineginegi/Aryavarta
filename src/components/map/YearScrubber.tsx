"use client";

import type { MapMarker } from "@/lib/db/queries/map";
import type { Playback } from "@/lib/use-year-playback";

/**
 * Player glyphs as inline SVG, not text characters. "▶" and "❚❚" sit on the
 * text baseline, so they render at different sizes and vertical positions per
 * platform font; a drawn icon is identical everywhere and centres properly
 * against its label.
 */
function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
      <path d="M1.5 0.8 L9 5 L1.5 9.2 Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
      <rect x="1" y="0.8" width="2.8" height="8.4" rx="0.6" />
      <rect x="6.2" y="0.8" width="2.8" height="8.4" rx="0.6" />
    </svg>
  );
}

/** Standard skip-to-next: triangle against a bar, as in any media player. */
function SkipIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
      <path d="M0.8 0.8 L7 5 L0.8 9.2 Z" />
      <rect x="7.8" y="0.8" width="1.8" height="8.4" rx="0.5" />
    </svg>
  );
}

/**
 * The scrubber and its replay controls.
 *
 * Ported from the living-map prototype's control row. The prototype's markers
 * were a hardcoded list of historical moments; these come from published
 * union-scope events, so a marker is always a record you can open. When the
 * archive holds none, the ticks and the caption line simply do not render and
 * the scrubber behaves exactly as it did before.
 */
export function YearScrubber({
  playback,
  min,
  max,
  markers,
}: {
  playback: Playback;
  min: number;
  max: number;
  markers: MapMarker[];
}) {
  const { year, playing, speed, loop, setYear, toggle, cycleSpeed, toggleLoop, skipTo } =
    playback;
  const span = Math.max(1, max - min);

  // Only markers the scrubber can actually reach. The archive can hold a
  // union event from before the earliest recorded term, and plotting one would
  // put a tick off the end of the track and give the skip button a target the
  // slider cannot travel to.
  const inRange = markers.filter((m) => m.year >= min && m.year <= max);
  const markerYears = inRange.map((m) => m.year);

  // The most recent marker at or before the selected year: the caption states
  // what the archive holds around this point, and says so when the nearest
  // record is some years back rather than implying it happened now.
  const current = markers.reduce<MapMarker | null>(
    (best, m) => (m.year <= year && (!best || m.year >= best.year) ? m : best),
    null,
  );

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="w-24 shrink-0 text-right">
          <span className="font-mono text-[2.1rem] font-bold leading-none text-ink tabular-nums">
            {String(year)}
          </span>
        </div>

        <button
          type="button"
          onClick={toggle}
          className="btn btn-primary btn-sm"
          aria-pressed={playing}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
          {playing ? "Pause" : "Play"}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cycleSpeed}
            className="press rounded-full bg-paper-badge px-3 py-1.5 font-mono text-[11px] tracking-[0.08em] text-ink-muted"
            aria-label={`Playback speed, currently ${speed} times. Change.`}
          >
            {speed}×
          </button>
          <button
            type="button"
            onClick={toggleLoop}
            aria-pressed={loop}
            className={`press rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.08em] ${
              loop ? "bg-ink text-paper" : "bg-paper-badge text-ink-muted"
            }`}
          >
            Loop
          </button>
          {markerYears.length > 0 && (
            <button
              type="button"
              onClick={() => skipTo(markerYears)}
              className="press inline-flex items-center gap-1.5 rounded-full bg-paper-badge px-3 py-1.5 font-mono text-[11px] tracking-[0.08em] text-ink-muted"
              aria-label="Jump to the next year with a recorded national event"
            >
              <SkipIcon />
              Next event
            </button>
          )}
        </div>

        <div className="relative min-w-[240px] flex-1">
          <input
            type="range"
            className="year-slider"
            min={min}
            max={max}
            step={1}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Select year"
            aria-valuetext={String(year)}
          />
          {inRange.length > 0 && (
            <div
              className="year-ticks pointer-events-none absolute inset-x-0"
              // Range inputs carry their own vertical margin, so the offset is
              // measured from the parent rather than assumed: 22px lands the
              // dots just under the 4px track.
              style={{ top: 22, height: 3 }}
              aria-hidden
            >
              {inRange.map((m) => (
                <span
                  key={m.eventId}
                  // Horizontal placement is .year-tick in globals.css: the
                  // thumb does not travel the full width, so a flat percentage
                  // missed it by up to half a thumb. Only the 0..1 position
                  // comes from here. -translate-x-1/2 centres the 3px dot on
                  // that point rather than hanging it off the right of it.
                  className="year-tick absolute top-0 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-ink-ghost"
                  style={{ "--p": (m.year - min) / span } as React.CSSProperties}
                />
              ))}
            </div>
          )}
          <div className="mt-1 flex justify-between font-mono text-[0.66rem] text-ink-faint">
            <span>{min}</span>
            <span>{max}</span>
          </div>
        </div>
      </div>

      {/* Reserved height, so the row below does not jump as the caption
          changes during playback. */}
      <p className="mt-3 min-h-[1.25rem] text-[0.78rem] text-ink-muted" aria-live="polite">
        {current && (
          <>
            <a
              href={`/event/${current.eventId}`}
              className="font-mono text-[10px] tracking-[0.06em] text-accent"
            >
              {current.year}
            </a>{" "}
            <span className="text-ink-soft">{current.title}</span>
            {current.year !== year && (
              <span className="text-ink-ghost"> (nearest record before {year})</span>
            )}
          </>
        )}
      </p>

      {/* The "From the record" fact line lives on the map plate itself now,
          as the annotation block in the ocean: the artwork and its words
          share one frame. */}
    </div>
  );
}
