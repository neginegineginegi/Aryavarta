"use client";

import india from "@svg-maps/india";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import type { MapData, MapTerm } from "@/lib/db/queries/map";

const NO_DATA_COLOR = "var(--color-nodata)";
const PR_COLOR = "var(--color-pr)";

type Tooltip = {
  x: number;
  y: number;
  stateName: string;
  line: string;
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

export function MapExplorer({ data }: { data: MapData }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [year, setYear] = useState(data.maxYear);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

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

  const view = useMemo(() => {
    const fills = new Map<string, string>();
    const legendCounts = new Map<
      string,
      { label: string; color: string; count: number; order: number }
    >();
    for (const loc of india.locations) {
      const term = governingTermAt(termsByState.get(loc.id), year);
      let color: string;
      let key: string;
      let label: string;
      let order: number;
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
      fills.set(loc.id, color);
      const entry = legendCounts.get(key);
      if (entry) entry.count += 1;
      else legendCounts.set(key, { label, color, count: 1, order });
    }
    const legend = [...legendCounts.values()].sort(
      (a, b) => a.order - b.order || b.count - a.count || a.label.localeCompare(b.label),
    );
    return { fills, legend };
  }, [termsByState, year]);

  function showTooltip(e: React.PointerEvent, stateId: string) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const term = governingTermAt(termsByState.get(stateId), year);
    const line = !term
      ? "No recorded government for this year"
      : term.kind === "presidents_rule"
        ? "President's Rule"
        : `${term.cmName} · ${term.partyName}`;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      stateName: stateNames.get(stateId) ?? stateId,
      line,
    });
  }

  function open(stateId: string) {
    router.push(`/state/${stateId}/${year}`);
  }

  return (
    <div>
      {/* Year scrubber */}
      <div className="mb-5 flex items-center gap-5">
        <div className="w-24 shrink-0 text-right">
          <span className="font-display text-4xl font-semibold tabular-nums leading-none text-ink">
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
          <div className="mt-1 flex justify-between text-[0.72rem] tabular-nums text-ink-faint">
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
            {india.locations.map((loc) => (
              <path
                key={loc.id}
                d={loc.path}
                className="map-state"
                fill={view.fills.get(loc.id)}
                tabIndex={0}
                role="link"
                aria-label={`${loc.name}, ${year}`}
                onClick={() => open(loc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(loc.id);
                  }
                }}
                onPointerMove={(e) => showTooltip(e, loc.id)}
                onPointerLeave={() => setTooltip(null)}
              >
                <title>{loc.name}</title>
              </path>
            ))}
          </svg>
          {tooltip && (
            <div
              className="pointer-events-none absolute z-10 max-w-60 rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.8rem] shadow-sm"
              style={{
                left: Math.min(tooltip.x + 14, (containerRef.current?.clientWidth ?? 300) - 180),
                top: tooltip.y + 14,
              }}
            >
              <p className="font-semibold text-ink">{tooltip.stateName}</p>
              <p className="text-ink-muted">{tooltip.line}</p>
              <p className="mt-0.5 text-[0.72rem] text-ink-faint">Click for details →</p>
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
                  style={{ backgroundColor: l.color }}
                />
                <span className="flex-1 text-ink">{l.label}</span>
                <span className="tabular-nums text-ink-faint">{l.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-faint">
            Colors show the party of the government in office on 31 December of the selected
            year. Boundaries are pre-2019 and illustrative.
          </p>
        </aside>
      </div>
    </div>
  );
}
