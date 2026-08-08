"use client";

import india from "@svg-maps/india";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MapData, MapTerm } from "@/lib/db/queries/map";
import { ModeSwitch } from "@/components/layout/HeaderNav";
import { YearScrubber } from "@/components/map/YearScrubber";
import { useYearPlayback } from "@/lib/use-year-playback";
import { CursorText } from "@/components/ui/CursorText";

const NO_DATA_COLOR = "var(--color-nodata)";
const PR_COLOR = "var(--color-pr)";
// Diagonal hatch used for states that did not exist as a separate entity in
// the selected year (formed later, or since merged/reorganised).
const NA_FILL = "url(#na-hatch)";
const NA_SWATCH =
  "repeating-linear-gradient(45deg, var(--color-paper-sunken) 0 2px, var(--color-rule-dark) 2px 3px)";
const TOOLTIP_WIDTH = 260;
const TOOLTIP_HEIGHT = 90;
/** Per-state delay in the load-in wave; 14ms is the handoff's figure. */
const REVEAL_STEP_MS = 14;
/** Lerp factor for the tooltip's trail. Higher is tighter to the cursor. */
const TRAIL = 0.22;

type Tooltip = {
  stateId: string;
  /** 'pointer' follows the cursor; 'focus' pins to a fixed corner for keyboard users. */
  anchor: "pointer" | "focus";
};

/** The term governing a state at the end of the given year, if any. */
function governingTermAt(
  termsForState: MapTerm[] | undefined,
  year: number,
): MapTerm | null {
  if (!termsForState) return null;
  const at = `${year}-12-31`;
  // terms are sorted by startDate ascending; last match wins.
  let found: MapTerm | null = null;
  for (const t of termsForState) {
    if (t.startDate <= at && (t.endDate === null || t.endDate >= at)) {
      found = t;
    }
  }
  return found;
}

function describeTerm(term: MapTerm | null): string {
  if (!term) return "No recorded government for this year";
  if (term.kind === "presidents_rule") return "President's Rule";
  return `${term.cmName} · ${term.partyName}`;
}

export function MapExplorer({
  data,
  // Hidden when the explorer sits inside MapPanel, which owns the switch.
  showModeSwitch = true,
}: {
  data: MapData;
  showModeSwitch?: boolean;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // The selected year is mirrored into the URL (?y=) so any view of the atlas
  // is shareable. Written via history.replaceState, never a router push: a
  // slider tick, and every step of a replay, must not touch the server.
  const syncUrl = useCallback(
    (y: number) => {
      const url = new URL(window.location.href);
      if (y === data.maxYear) url.searchParams.delete("y");
      else url.searchParams.set("y", String(y));
      window.history.replaceState(null, "", url.toString());
    },
    [data.maxYear],
  );

  const playback = useYearPlayback({
    min: data.minYear,
    max: data.maxYear,
    initial: data.maxYear,
    onYearChange: syncUrl,
  });
  const { year, setYear, stop } = playback;

  // Read ?y= client-side after mount, which keeps the page statically
  // cacheable. setYear rather than a raw setState so the URL stays canonical.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("y");
    if (raw && /^\d{4}$/.test(raw)) setYear(Number(raw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const termsByState = useMemo(() => {
    const m = new Map<string, MapTerm[]>();
    for (const t of data.terms) {
      const arr = m.get(t.stateId);
      if (arr) arr.push(t);
      else m.set(t.stateId, [t]);
    }
    return m;
  }, [data.terms]);

  const stateNames = useMemo(
    () => new Map(data.states.map((s) => [s.id, s.name])),
    [data.states],
  );

  // Formation / dissolution years, so the map can show a state as "not yet
  // formed" (e.g. Telangana before 2014) rather than coloring it as though it
  // existed. Uses the end-of-year semantics: a state formed on 2000-11-09
  // counts as existing for the year 2000.
  const stateLifecycle = useMemo(() => {
    const m = new Map<string, { formedY: number | null; dissolvedY: number | null }>();
    for (const s of data.states) {
      m.set(s.id, {
        formedY: s.formedOn ? Number(s.formedOn.slice(0, 4)) : null,
        dissolvedY: s.dissolvedOn ? Number(s.dissolvedOn.slice(0, 4)) : null,
      });
    }
    return m;
  }, [data.states]);

  const view = useMemo(() => {
    const fills = new Map<string, string>();
    const lines = new Map<string, string>();
    const legendCounts = new Map<
      string,
      { label: string; color: string; count: number; order: number; hatch: boolean }
    >();
    for (const loc of india.locations) {
      const life = stateLifecycle.get(loc.id);
      let color: string;
      let key: string;
      let label: string;
      let order: number;
      let line: string;
      let hatch = false;

      if (life?.formedY != null && year < life.formedY) {
        // The state did not exist as a separate entity yet this year.
        hatch = true;
        color = NA_FILL;
        key = "__na";
        label = "Not yet formed / n.a.";
        order = 3;
        line = `Not yet a separate state; established ${life.formedY}`;
      } else if (life?.dissolvedY != null && year >= life.dissolvedY) {
        hatch = true;
        color = NA_FILL;
        key = "__na";
        label = "Not yet formed / n.a.";
        order = 3;
        line = `Merged / reorganised in ${life.dissolvedY}`;
      } else {
        const term = governingTermAt(termsByState.get(loc.id), year);
        line = describeTerm(term);
        if (!term) {
          color = NO_DATA_COLOR;
          key = "__nodata";
          label = "No data";
          order = 2;
        } else if (term.kind === "presidents_rule") {
          color = PR_COLOR;
          key = "__pr";
          label = "President's Rule";
          order = 1;
        } else {
          color = term.partyColor ?? PR_COLOR;
          key = term.partyId ?? "__unknown";
          label = term.partyName ?? "Unknown party";
          order = 0;
        }
      }

      fills.set(loc.id, color);
      lines.set(loc.id, line);
      const entry = legendCounts.get(key);
      if (entry) entry.count += 1;
      else legendCounts.set(key, { label, color, count: 1, order, hatch });
    }
    const legend = [...legendCounts.values()].sort(
      (a, b) => a.order - b.order || b.count - a.count || a.label.localeCompare(b.label),
    );
    return { fills, lines, legend };
  }, [termsByState, stateLifecycle, year]);

  // Tooltip trail. The prototype lerps the tip toward the cursor at 0.22 per
  // frame so it arrives a beat late, which reads as weight. Position is
  // written straight to the node inside the animation frame rather than held
  // in React state: a setState per pointermove would re-render the whole map.
  const targetRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const trailingRef = useRef(false);

  const place = useCallback((x: number, y: number) => {
    const el = tipRef.current;
    const box = containerRef.current;
    if (!el || !box) return;
    // Clamped to the card, so the tip never escapes the map it describes.
    const left = Math.max(0, Math.min(x + 14, box.clientWidth - TOOLTIP_WIDTH));
    const top =
      y + 14 + TOOLTIP_HEIGHT > box.clientHeight
        ? Math.max(0, y - 14 - TOOLTIP_HEIGHT)
        : y + 14;
    el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }, []);

  // A plain declaration, not a useCallback: the loop schedules itself, and it
  // only ever reads refs, so a fresh closure per render costs nothing.
  function step() {
    const p = posRef.current;
    const t = targetRef.current;
    p.x += (t.x - p.x) * TRAIL;
    p.y += (t.y - p.y) * TRAIL;
    place(p.x, p.y);
    rafRef.current = requestAnimationFrame(step);
  }

  function showPointerTooltip(e: React.PointerEvent, stateId: string) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    targetRef.current = { x, y };

    if (!trailingRef.current) {
      // First frame of a new hover: snap, so the tip does not fly in from
      // wherever the pointer left the map last time.
      trailingRef.current = true;
      posRef.current = { x, y };
      place(x, y);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        rafRef.current = requestAnimationFrame(step);
      }
    } else if (rafRef.current === null) {
      place(x, y); // reduced motion: track exactly, no easing
    }
    setTooltip({ stateId, anchor: "pointer" });
  }

  const endTrail = useCallback(() => {
    trailingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => endTrail, [endTrail]);

  // Keyboard scrubbing, per the prototype: arrows step a year, space plays.
  // Bound to the document but ignored unless the body itself has focus, so a
  // reader tabbed into the slider, a state path or any other control keeps
  // that element's native key handling.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target !== document.body) return;
      if (e.key === "ArrowRight") setYear(year + 1);
      else if (e.key === "ArrowLeft") setYear(year - 1);
      else if (e.key === " ") {
        e.preventDefault();
        playback.toggle();
      } else return;
      if (e.key !== " ") stop();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [year, setYear, stop, playback]);

  function open(stateId: string) {
    // Straight to the state's home page, carrying the selected year so the
    // page opens with that year's government in focus. The citable
    // single-year snapshot stays linked from there.
    router.push(`/state/${stateId}?y=${year}`);
  }

  // Tooltip text derives from current state at render time, so a year change
  // while the tooltip is open can never show stale content.
  const tooltipContent = tooltip
    ? {
        stateName: stateNames.get(tooltip.stateId) ?? tooltip.stateId,
        line: view.lines.get(tooltip.stateId) ?? "",
      }
    : null;

  return (
    <div>
      {showModeSwitch && (
        <div className="mb-4">
          <ModeSwitch />
        </div>
      )}

      <YearScrubber
        playback={playback}
        min={data.minYear}
        max={data.maxYear}
        markers={data.markers}
        facts={data.facts}
      />

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Map */}
        <div ref={containerRef} className="relative mx-auto w-full max-w-xl flex-1">
          <svg
            viewBox={india.viewBox}
            role="group"
            aria-label={`Map of India showing the party in power in each state at the end of ${year}`}
            className="h-auto w-full"
          >
            <defs>
              <pattern
                id="na-hatch"
                patternUnits="userSpaceOnUse"
                width="6"
                height="6"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="var(--color-paper-sunken)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-rule-dark)" strokeWidth="2" />
              </pattern>
            </defs>
            {india.locations.map((loc, i) => (
              <path
                key={loc.id}
                d={loc.path}
                className="map-state map-reveal"
                // The load-in wave: the country assembles state by state
                // instead of appearing all at once.
                style={{ animationDelay: `${i * REVEAL_STEP_MS}ms` }}
                fill={view.fills.get(loc.id)}
                tabIndex={0}
                role="link"
                aria-label={`${loc.name}, ${year}: ${view.lines.get(loc.id)}. Open details.`}
                onClick={() => open(loc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(loc.id);
                  }
                }}
                onFocus={() => setTooltip({ stateId: loc.id, anchor: "focus" })}
                onBlur={() => setTooltip((t) => (t?.anchor === "focus" ? null : t))}
                onPointerMove={(e) => showPointerTooltip(e, loc.id)}
                onPointerLeave={() => {
                  endTrail();
                  setTooltip((t) => (t?.anchor === "pointer" ? null : t));
                }}
              />
            ))}
            {/* Lakshadweep's real geometry is a scatter of sub-pixel islands
                (x 82-115, y 590-664) that no screen can show; this marker over
                the island group keeps the UT visible, hoverable, and clickable.
                It shares the state's computed fill, so it colors, hatches, and
                grays exactly like every other state. */}
            <circle
              cx={98}
              cy={627}
              r={7}
              className="map-state"
              fill={view.fills.get("ld")}
              tabIndex={0}
              role="link"
              aria-label={`Lakshadweep, ${year}: ${view.lines.get("ld")}. Open details.`}
              onClick={() => open("ld")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open("ld");
                }
              }}
              onFocus={() => setTooltip({ stateId: "ld", anchor: "focus" })}
              onBlur={() => setTooltip((t) => (t?.anchor === "focus" ? null : t))}
              onPointerMove={(e) => showPointerTooltip(e, "ld")}
              onPointerLeave={() => {
                endTrail();
                setTooltip((t) => (t?.anchor === "pointer" ? null : t));
              }}
            />
          </svg>
          {tooltip && tooltipContent && (
            <div
              ref={tipRef}
              className="pointer-events-none absolute left-0 top-0 z-10 w-60 rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.8rem] shadow-sm"
              // Pointer position is written by the trail loop; a focus anchor
              // is pinned, because a tooltip that drifts is no help to someone
              // navigating by keyboard.
              style={tooltip.anchor === "focus" ? { transform: "translate3d(8px, 8px, 0)" } : undefined}
            >
              <p className="font-semibold text-ink">{tooltipContent.stateName}</p>
              <p className="text-ink-muted">{tooltipContent.line}</p>
              <p className="mt-0.5 text-[0.72rem] text-ink-faint">
                {tooltip.anchor === "focus" ? "Press Enter for details" : "Click for details"}
              </p>
            </div>
          )}
        </div>

        {/* Legend */}
        <aside className="lg:w-60">
          {/* .section-label is mono, so "ink" for the same reason as the year
              readout: no variable weight axis to interpolate. */}
          <h2 className="section-label">
            <CursorText mode="ink">{`In power, end of ${year}`}</CursorText>
          </h2>
          <ul className="mt-2.5 space-y-1.5 border-t border-rule pt-2.5">
            {view.legend.map((l) => (
              <li
                key={l.label}
                className="row-hover flex items-center gap-2 rounded-sm px-1 text-[0.85rem]"
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-[2px] border border-black/10"
                  style={l.hatch ? { background: NA_SWATCH } : { backgroundColor: l.color }}
                />
                {/* Party names wrap in this 60-unit column, and "chars"
                    changes advance widths, which would re-break the line
                    under the pointer. "ink" cannot affect layout. */}
                <span className="flex-1 text-ink">
                  <CursorText mode="ink">{l.label}</CursorText>
                </span>
                <span className="tabular-nums text-ink-faint">{l.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-faint">
            Colors show the party of the government in office on 31 December of the selected
            year. Hatched states did not exist as a separate entity that year (formed later or
            since merged). Boundaries are pre-2019 and illustrative.
          </p>
        </aside>
      </div>
    </div>
  );
}
