"use client";

import type { Bridge, Convergence } from "@/lib/funding/analysis";

/**
 * What shape the drawn network has, and nothing beyond that.
 *
 * Every item states the fact that produced it in words a reader can check
 * against the diagram in front of them. The headings are deliberately flat:
 * "holds two groups together" rather than "network bridge", because the second
 * sounds like a role somebody plays and the first is a description of a
 * picture.
 *
 * The caveat under each heading is not boilerplate. A bridge in a diagram of
 * forty relationships is a bridge in what has been recorded so far, and it can
 * stop being one the moment somebody files a source.
 */
export function StructurePanel({
  hasRoot = true,
  bridges,
  convergences,
  componentCount,
  labelOf,
  onSelect,
}: {
  /** Convergence is measured from a starting point; the whole-web view has none. */
  hasRoot?: boolean;
  bridges: Bridge[];
  convergences: Convergence[];
  componentCount: number;
  labelOf: (key: string) => string;
  onSelect: (key: string) => void;
}) {
  const list = (keys: string[]) => keys.map(labelOf).join(", ");

  return (
    <div className="net-card">
      <p className="net-card-kind">Shape of what is drawn</p>
      <h3 className="net-card-title">Structure</h3>
      <p className="net-card-sub">
        Observations about this diagram, recomputed from what is on screen. They describe the
        record, not the world: every one of them can change when a source is added.
      </p>

      {componentCount > 1 && (
        <>
          <h4 className="net-card-h">Separate groups</h4>
          <p className="net-card-sub">
            What is drawn falls into {componentCount} groups with no recorded relationship between
            them. It looks like one network only because it is on one canvas.
          </p>
        </>
      )}

      <h4 className="net-card-h">Entities holding two groups together</h4>
      {bridges.length === 0 ? (
        <p className="net-card-sub">
          None. Every entity here would still be connected to the rest if any single other one were
          removed.
        </p>
      ) : (
        <ul className="net-structure">
          {bridges.map((b) => (
            <li key={b.key}>
              <button type="button" onClick={() => onSelect(b.key)}>
                {labelOf(b.key)}
              </button>
              <p className="net-structure-why">
                Without it, {b.separates.length === 2 ? "these two groups" : `these ${b.separates.length} groups`} would
                have no recorded relationship path to each other:{" "}
                {b.separates.map((g, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    <em>{list(g)}</em>
                  </span>
                ))}
                .
              </p>
            </li>
          ))}
        </ul>
      )}
      {bridges.length > 0 && (
        <p className="net-structure-caveat">
          This says an entity sits between two groups in what has been recorded. It says nothing
          about influence, control, or whether anyone intended it.
        </p>
      )}

      {hasRoot && <h4 className="net-card-h">Reached by more than one route</h4>}
      {hasRoot && convergences.length === 0 && (
        <p className="net-card-sub">
          None. Every entity here is reached from the starting point one way only.
        </p>
      )}
      {hasRoot && convergences.length > 0 && (
        <ul className="net-structure">
          {convergences.map((c) => (
            <li key={c.key}>
              <button type="button" onClick={() => onSelect(c.key)}>
                {labelOf(c.key)}
              </button>
              <p className="net-structure-why">
                {c.arrivals.length} routes of {c.hops} steps arrive here, via {list(c.arrivals)}.
              </p>
            </li>
          ))}
        </ul>
      )}
      {hasRoot && convergences.length > 0 && (
        <p className="net-structure-caveat">
          Two routes arriving at one place is a fact about this diagram. It is not evidence that the
          routes are related to each other, or that the entity they meet at did anything.
        </p>
      )}
    </div>
  );
}
