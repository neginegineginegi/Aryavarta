"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MapExplorer } from "@/components/map/MapExplorer";
import { UnionMapExplorer } from "@/components/map/UnionMapExplorer";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { MapData, UnionMapData } from "@/lib/db/queries/map";

type Mode = "states" | "union";

const SEGMENTS = [
  { value: "states" as const, label: "States" },
  { value: "union" as const, label: "Union" },
];

/**
 * States and Union as one surface.
 *
 * Until now the switch was two links: it looked like a view control and
 * behaved like navigation, which is the mismatch a reader feels as "why did
 * the page change". Both payloads are small and separately cached, so the page
 * can hold each and swap between them without leaving.
 *
 * /union is untouched and still the full union record, with the Prime Minister
 * list, Lok Sabha elections and governors that do not exist here. It is
 * reached by clicking the map, exactly as before.
 *
 * The selected year survives the swap for free: both explorers write ?y= and
 * read it on mount, so the incoming map lands on the year the outgoing one
 * was showing.
 */
export function MapPanel({
  states,
  union,
}: {
  states: MapData;
  union: UnionMapData;
}) {
  const [mode, setMode] = useState<Mode>("states");
  const [hidden, setHidden] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shareable, like ?y=. replaceState so a toggle is not a history entry to
  // click back through.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("mode");
    // Read after mount, like ?y=, so the page stays statically cacheable. The
    // extra render is the cost of not opting the whole home page out of static
    // rendering to read one query parameter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (raw === "union") setMode("union");
  }, []);

  const swap = useCallback((next: Mode) => {
    setMode((current) => {
      if (current === next) return current;

      const url = new URL(window.location.href);
      if (next === "union") url.searchParams.set("mode", "union");
      else url.searchParams.delete("mode");
      window.history.replaceState(null, "", url.toString());

      // Sequential crossfade, per the motion rules: the outgoing view falls
      // away, then the incoming one rises. Interruptible, so a reader
      // double-toggling never strands a half-faded map.
      if (pending.current) clearTimeout(pending.current);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return next;

      setHidden(true);
      pending.current = setTimeout(() => {
        setHidden(false);
        pending.current = null;
      }, 200);
      return next;
    });
  }, []);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  return (
    <div>
      <div className="mb-5 flex justify-center">
        <SegmentedControl
          segments={SEGMENTS}
          value={mode}
          onChange={swap}
          ariaLabel="Show state governments or the Union"
        />
      </div>

      <div className={`view-swap ${hidden ? "view-hidden" : ""}`}>
        {mode === "states" ? (
          <MapExplorer data={states} showModeSwitch={false} />
        ) : (
          <UnionMapExplorer data={union} showModeSwitch={false} />
        )}
      </div>
    </div>
  );
}
