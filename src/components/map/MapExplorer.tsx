"use client";

import india from "@svg-maps/india";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MapData, MapTerm } from "@/lib/db/queries/map";
import { ModeSwitch } from "@/components/layout/HeaderNav";

const NO_DATA_COLOR = "var(--color-nodata)";
const PR_COLOR = "var(--color-pr)";
// Diagonal hatch used for states that did not exist as a separate entity in
// the selected year (formed later, or since merged/reorganised).
const NA_FILL = "url(#na-hatch)";
const NA_SWATCH =
  "repeating-linear-gradient(45deg, var(--color-paper-sunken) 0 2px, var(--color-rule-dark) 2px 3px)";
const TOOLTIP_WIDTH = 260;
const TOOLTIP_HEIGHT = 90;

type Tooltip = {
  stateId: string;
  x: number;
  y: number;
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

export function MapExplorer({ data }: { data: MapData }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [year, setYearState] = useState(data.maxYear);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // The selected year is global state, mirrored into the URL (?y=) so any
  // view of the atlas is shareable. Read client-side after mount (keeps the
  // page statically cacheable); written via history.replaceState (no server
  // round-trip per slider tick).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("y");
    if (raw && /^\d{4}$/.test(raw)) {
      const y = Math.min(Math.max(Number(raw), data.minYear), data.maxYear);
      setYearState(y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setYear(y: number) {
    setYearState(y);
    const url = new URL(window.location.href);
    if (y === data.maxYear) url.searchParams.delete("y");
    else url.searchParams.set("y", String(y));
    window.history.replaceState(null, "", url.toString());
  }

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

  function showPointerTooltip(e: React.PointerEvent, stateId: string) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ stateId, x: e.clientX - rect.left, y: e.clientY - rect.top, anchor: "pointer" });
  }

  function open(stateId: string) {
    router.push(`/state/${stateId}/${year}`);
  }

  // Tooltip text derives from current state at render time, so a year change
  // while the tooltip is open can never show stale content.
  const tooltipContent = tooltip
    ? {
        stateName: stateNames.get(tooltip.stateId) ?? tooltip.stateId,
        line: view.lines.get(tooltip.stateId) ?? "",
      }
    : null;

  const containerW = containerRef.current?.clientWidth ?? 320;
  const containerH = containerRef.current?.clientHeight ?? 400;

  return (
    <div>
      {/* The map's own mode control: which government layer is shown. */}
      <div className="mb-4">
        <ModeSwitch />
      </div>

      {/* Year scrubber */}
      <div className="mb-5 flex items-center gap-5">
        <div className="w-24 shrink-0 text-right">
          <span className="font-mono text-[2.1rem] font-bold leading-none text-ink">
            {year}
          </span>
        </div>
        <div className="flex-1">
          <input
            type="range"
            className="year-slider"
            min={data.minYear}
            max={data.maxYear}
            step={1}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Select year"
            aria-valuetext={String(year)}
          />
          <div className="mt-1 flex justify-between font-mono text-[0.66rem] text-ink-faint">
            <span>{data.minYear}</span>
            <span>{data.maxYear}</span>
          </div>
        </div>
      </div>

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
            {india.locations.map((loc) => (
              <path
                key={loc.id}
                d={loc.path}
                className="map-state"
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
                onFocus={() => setTooltip({ stateId: loc.id, x: 8, y: 8, anchor: "focus" })}
                onBlur={() => setTooltip((t) => (t?.anchor === "focus" ? null : t))}
                onPointerMove={(e) => showPointerTooltip(e, loc.id)}
                onPointerLeave={() =>
                  setTooltip((t) => (t?.anchor === "pointer" ? null : t))
                }
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
              onFocus={() => setTooltip({ stateId: "ld", x: 8, y: 8, anchor: "focus" })}
              onBlur={() => setTooltip((t) => (t?.anchor === "focus" ? null : t))}
              onPointerMove={(e) => showPointerTooltip(e, "ld")}
              onPointerLeave={() =>
                setTooltip((t) => (t?.anchor === "pointer" ? null : t))
              }
            />
          </svg>
          {tooltip && tooltipContent && (
            <div
              className="pointer-events-none absolute z-10 w-60 rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.8rem] shadow-sm"
              style={
                tooltip.anchor === "focus"
                  ? { left: tooltip.x, top: tooltip.y }
                  : {
                      left: Math.max(
                        0,
                        Math.min(tooltip.x + 14, containerW - TOOLTIP_WIDTH),
                      ),
                      top:
                        tooltip.y + 14 + TOOLTIP_HEIGHT > containerH
                          ? Math.max(0, tooltip.y - 14 - TOOLTIP_HEIGHT)
                          : tooltip.y + 14,
                    }
              }
            >
              <p className="font-semibold text-ink">{tooltipContent.stateName}</p>
              <p className="text-ink-muted">{tooltipContent.line}</p>
              <p className="mt-0.5 text-[0.72rem] text-ink-faint">
                {tooltip.anchor === "focus" ? "Press Enter for details" : "Click for details →"}
              </p>
            </div>
          )}
        </div>

        {/* Legend */}
        <aside className="lg:w-60">
          <h2 className="section-label">In power, end of {year}</h2>
          <ul className="mt-2.5 space-y-1.5 border-t border-rule pt-2.5">
            {view.legend.map((l) => (
              <li key={l.label} className="flex items-center gap-2 text-[0.85rem]">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-[2px] border border-black/10"
                  style={l.hatch ? { background: NA_SWATCH } : { backgroundColor: l.color }}
                />
                <span className="flex-1 text-ink">{l.label}</span>
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
