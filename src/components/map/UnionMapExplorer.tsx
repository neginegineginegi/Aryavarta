"use client";

import india from "@svg-maps/india";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { UnionMapData, UnionTerm } from "@/lib/db/queries/map";
import { ModeSwitch } from "@/components/layout/HeaderNav";

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
  const [year, setYearState] = useState(data.maxYear);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

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

      {/* Year scrubber */}
      <div className="mb-5 flex items-center gap-5">
        <div className="w-24 shrink-0 text-right">
          <span className="font-mono text-[2.1rem] font-bold leading-none text-ink">{year}</span>
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
              setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onPointerLeave={() => setTip(null)}
          >
            {india.locations.map((loc) => (
              <path key={loc.id} d={loc.path} className="map-state" fill={fill} aria-hidden />
            ))}
            {/* Lakshadweep's real islands are sub-pixel at this scale; the
                marker keeps the territory visible. */}
            <circle cx={98} cy={627} r={7} className="map-state" fill={fill} aria-hidden />
          </svg>
          {tip && (
            <div
              className="pointer-events-none absolute z-10 w-64 rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.8rem] shadow-sm"
              style={{
                left: Math.max(0, Math.min(tip.x + 14, (containerRef.current?.clientWidth ?? 320) - 260)),
                top: Math.max(0, tip.y - 84),
              }}
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
