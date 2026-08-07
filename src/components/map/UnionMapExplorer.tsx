"use client";

import india from "@svg-maps/india";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { UnionMapData, UnionTerm } from "@/lib/db/queries/map";
import { ModeSwitch } from "@/components/layout/HeaderNav";
import { YearScrubber } from "@/components/map/YearScrubber";
import { useYearPlayback } from "@/lib/use-year-playback";

// Mirror of personSlug in lib/db/queries/person.ts, which cannot be imported
// here: that module pulls in the server-only db client.
function personSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "unknown"
  );
}

const PLACEHOLDER = "var(--color-pr)";
const NO_DATA = "var(--color-nodata)";

/** The term of the given office in effect at the end of the given year. */
function governingAt(
  terms: UnionTerm[],
  kind: "pm" | "president",
  year: number,
): UnionTerm | null {
  const at = `${year}-12-31`;
  let found: UnionTerm | null = null;
  for (const t of terms) {
    if (t.kind === kind && t.startDate <= at && (t.endDate === null || t.endDate >= at)) {
      found = t;
    }
  }
  return found;
}

function OfficeRow({ label, term }: { label: string; term: UnionTerm | null }) {
  return (
    <li className="flex items-start gap-2 text-[0.9rem]">
      <span
        aria-hidden
        className="mt-1.5 h-3 w-3 shrink-0 rounded-[2px] border border-black/10"
        style={{ backgroundColor: term ? (term.partyColor ?? "#8a8a8a") : "#e9e9e5" }}
      />
      <span>
        <span className="block font-mono text-[0.62rem] uppercase tracking-[0.1em] text-ink-faint">
          {label}
        </span>
        {term?.cmName ? (
          <>
            <Link
              href={`/person/${personSlug(term.cmName)}`}
              className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
            >
              {term.cmName}
            </Link>
            {term.partyName ? (
              term.partyId ? (
                <>
                  {" "}
                  <Link href={`/party/${term.partyId}`} className="text-ink-muted hover:underline">
                    ({term.partyName})
                  </Link>
                </>
              ) : (
                <span className="text-ink-muted"> ({term.partyName})</span>
              )
            ) : null}
          </>
        ) : (
          <span className="text-ink-faint">No term recorded</span>
        )}
      </span>
    </li>
  );
}

/**
 * Union-mode map: the whole country takes the color of the Prime Minister's
 * party in office at the end of the selected year. Same year-in-URL behavior
 * as the state map (?y=, written via replaceState so the page stays static).
 */
export function UnionMapExplorer({ data }: { data: UnionMapData }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipOn, setTipOn] = useState(false);

  const syncUrl = useCallback(
    (y: number) => {
      const url = new URL(window.location.href);
      if (y === data.maxYear) url.searchParams.delete("y");
      else url.searchParams.set("y", String(y));
      window.history.replaceState(null, "", url.toString());
    },
    [data.maxYear],
  );

  // The same playback the state map uses. Union mode is where a replay reads
  // most clearly: the whole country changes colour at once, so a run from 1947
  // is a flipbook of general elections.
  const playback = useYearPlayback({
    min: data.minYear,
    max: data.maxYear,
    initial: data.maxYear,
    onYearChange: syncUrl,
  });
  const { year, setYear, stop } = playback;

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("y");
    if (raw && /^\d{4}$/.test(raw)) setYear(Number(raw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tooltip position is written to the node rather than held in state, so a
  // pointermove does not re-render the map. Same approach as the state map,
  // minus the trail: this tip is pinned above the cursor, not chasing it.
  const pending = useRef({ x: 0, y: 0 });
  const place = useCallback((x: number, y: number) => {
    pending.current = { x, y };
    const el = tipRef.current;
    const box = containerRef.current;
    if (!el || !box) return;
    el.style.transform = `translate3d(${Math.max(
      0,
      Math.min(x + 14, box.clientWidth - 260),
    )}px, ${Math.max(0, y - 84)}px, 0)`;
  }, []);

  // The first pointermove of a hover happens before the tip exists, so place()
  // has no node to write to and the tip would render at the top-left corner
  // until the pointer moved again. Position it as soon as it mounts.
  useEffect(() => {
    if (tipOn) place(pending.current.x, pending.current.y);
  }, [tipOn, place]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target !== document.body) return;
      if (e.key === "ArrowRight") setYear(year + 1);
      else if (e.key === "ArrowLeft") setYear(year - 1);
      else if (e.key === " ") {
        e.preventDefault();
        playback.toggle();
        return;
      } else return;
      stop();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [year, setYear, stop, playback]);

  const pm = useMemo(() => governingAt(data.terms, "pm", year), [data.terms, year]);
  const president = useMemo(
    () => governingAt(data.terms, "president", year),
    [data.terms, year],
  );

  const fill = pm ? (pm.partyColor ?? PLACEHOLDER) : NO_DATA;
  const pmLine = pm
    ? `${pm.cmName}${pm.partyName ? ` · ${pm.partyName}` : ""}`
    : "No Prime Minister term recorded for this year";

  function open() {
    router.push(`/union/${year}`);
  }

  return (
    <div>
      {/* The map's own mode control: which government layer is shown. */}
      <div className="mb-4">
        <ModeSwitch />
      </div>

      <YearScrubber
        playback={playback}
        min={data.minYear}
        max={data.maxYear}
        markers={data.markers}
      />

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Map: one interactive surface; every path shares the Union fill */}
        <div ref={containerRef} className="relative mx-auto w-full max-w-xl flex-1">
          <svg
            viewBox={india.viewBox}
            role="link"
            tabIndex={0}
            aria-label={`Map of India, ${year}: Union governed by ${pmLine}. Open the ${year} record.`}
            className="h-auto w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4"
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
              }
            }}
            onPointerMove={(e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              place(e.clientX - rect.left, e.clientY - rect.top);
              if (!tipOn) setTipOn(true);
            }}
            onPointerLeave={() => setTipOn(false)}
          >
            {india.locations.map((loc, i) => (
              <path
                key={loc.id}
                d={loc.path}
                className="map-state map-reveal"
                style={{ animationDelay: `${i * 14}ms` }}
                fill={fill}
                aria-hidden
              />
            ))}
            {/* Lakshadweep's real islands are sub-pixel at this scale; the
                marker keeps the territory visible. */}
            <circle cx={98} cy={627} r={7} className="map-state" fill={fill} aria-hidden />
          </svg>
          {tipOn && (
            <div
              ref={tipRef}
              className="pointer-events-none absolute left-0 top-0 z-10 w-64 rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.8rem] shadow-sm"
            >
              <p className="font-semibold text-ink">Union of India</p>
              <p className="text-ink-muted">{pmLine}</p>
              {president?.cmName ? (
                <p className="text-ink-muted">President: {president.cmName}</p>
              ) : null}
              <p className="mt-0.5 font-mono text-[0.62rem] text-ink-faint">
                Click for the {year} record →
              </p>
            </div>
          )}
        </div>

        {/* Side panel */}
        <aside className="lg:w-64">
          <h2 className="section-label">In office, end of {year}</h2>
          <ul className="mt-2.5 space-y-3 border-t border-rule pt-3">
            <OfficeRow label="Prime Minister" term={pm} />
            <OfficeRow label="President" term={president} />
          </ul>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-faint">
            In Union mode the whole map takes the color of the Prime Minister&rsquo;s party in
            office on 31 December of the selected year. Click anywhere on the map to open that
            year&rsquo;s full Union record.
          </p>
        </aside>
      </div>
    </div>
  );
}
