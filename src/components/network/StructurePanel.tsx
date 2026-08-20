"use client";

import type { Bridge, Convergence, Density } from "@/lib/funding/analysis";

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
 *
 * And below a density threshold the panel declines to report either finding at
 * all. In a forest every internal entity is an articulation point by
 * definition, so naming them says nothing about those entities: it restates
 * that the data is sparse. A panel that cannot say anything true should say
 * that, rather than say something trivially true in a confident typeface.
 */
export function StructurePanel({
  hasRoot = true,
  bridges,
  convergences,
  componentCount,
  density,
  labelOf,
  onSelect,
}: {
  /** Convergence is measured from a starting point; the whole-web view has none. */
  hasRoot?: boolean;
  bridges: Bridge[];
  convergences: Convergence[];
  componentCount: number;
  /** Shape of the drawn neighbourhood. When it cannot support structure, the
   *  two findings below are withheld and the reason is stated instead. */
  density: Density;
  labelOf: (key: string) => string;
  onSelect: (key: string) => void;
}) {
  const list = (keys: string[]) => keys.map(labelOf).join(", ");
  // A group of thirty entities named in full is a wall of text nobody reads,
  // and the count is the part that carries the observation. The names stay
  // available: the entities are on the canvas, and the reader can click the
  // bridge to see what it sits between.
  const brief = (keys: string[]) => {
    const shown = keys.slice(0, 5).map(labelOf).join(", ");
    const rest = keys.length - 5;
    return rest > 0 ? `${shown} and ${rest} more` : shown;
  };

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

      {!density.supportsStructure && (
        <>
          <h4 className="net-card-h">Not enough here to read structure from</h4>
          {/* Three separate bodies rather than one sentence with a swapped
              opening clause. "Every entity with more than one relationship" is
              a true and useful explanation when there are relationships, and
              gibberish when there are none. */}
          {density.edges === 0 ? (
            <p className="net-card-sub">
              Nothing on this canvas connects to anything else, so there is no shape here to
              describe. Which entities hold groups together, and which are reached by more than
              one route, both need relationships between entities before they can mean anything.
            </p>
          ) : (
            <p className="net-card-sub">
              What is drawn is {density.cycles === 0 ? "branching, with no loops in it at all" : `almost entirely branching, with ${density.cycles === 1 ? "one loop" : `${density.cycles} loops`} in it`}:{" "}
              {density.nodes} entities and {density.edges} relationships between them. In a record
              shaped like that, every entity with more than one relationship sits between two
              groups, so naming the ones that do would tell you nothing the diagram does not
              already show. And two routes arriving at one entity needs a loop to be possible at
              all.
            </p>
          )}
          <p className="net-structure-caveat">
            This is a statement about how much has been filed so far, not about the entities. As
            sources are added and the record starts to loop back on itself, these findings begin
            to mean something and reappear here.
          </p>
        </>
      )}

      {density.supportsStructure && (
        <>
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
                    <em>{brief(g)}</em>
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
        </>
      )}
    </div>
  );
}
