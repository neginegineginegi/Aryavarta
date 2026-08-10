"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { edgeEvidenceAction, expandNodeAction } from "@/actions/network";
import type { EdgeEvidence } from "@/lib/db/queries/network";
import type { GraphEdge, GraphNode } from "@/lib/funding/graph-types";
import { edgeLabel, EVIDENCE_LABELS, NODE_TYPE_LABELS } from "@/lib/funding/labels";
import { bounds, seedNodes, step, type LayoutNode } from "@/lib/funding/layout";

import { EvidencePanel } from "@/components/network/EvidencePanel";

/**
 * The network graph.
 *
 * Layout runs in a requestAnimationFrame loop that writes SVG attributes
 * directly, the way the cursor field writes styles: React renders the node and
 * edge elements when the SET changes, and never once per frame. A hundred nodes
 * settling must not touch the component tree.
 *
 * Two rules the renderer enforces rather than assumes.
 *
 * An interpretive edge is drawn dashed, in the muted ink, and its label reads
 * as an assertion. It can never look like a documented relation, whatever the
 * data says.
 *
 * Selecting an edge opens its evidence. There is no path through this component
 * that shows a relationship without offering the source behind it.
 */

const W = 1200;
const H = 780;
const NODE_R: Record<string, number> = {
  org: 21,
  person: 17,
  campaign: 19,
  project: 19,
  legal_case: 18,
  publication: 15,
  outcome: 15,
  party: 18,
  state: 18,
};

type Sel = { kind: "node"; key: string } | { kind: "edge"; id: string } | null;

const keyOf = (n: { type: string; id: string }) => `${n.type}:${n.id}`;

export function NetworkGraph({
  initialNodes,
  initialEdges,
  initialDegrees,
  rootKey,
  truncated,
}: {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  initialDegrees: Record<string, number>;
  rootKey: string;
  truncated: boolean;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [degree, setDegree] = useState(initialDegrees);
  const [sel, setSel] = useState<Sel>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EdgeEvidence[] | null>(null);
  const [showClaims, setShowClaims] = useState(false);
  const [wasTruncated, setWasTruncated] = useState(truncated);
  // Null means "every year". The slider starts there rather than at the latest
  // year, because opening on a window would hide relationships without saying
  // it had.
  const [year, setYear] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const layoutRef = useRef<Map<string, LayoutNode>>(new Map());
  const nodeEls = useRef<Map<string, SVGGElement>>(new Map());
  const edgeEls = useRef<Map<string, SVGLineElement>>(new Map());
  const frame = useRef(0);
  const alpha = useRef(1);
  const drag = useRef<{ key: string; dx: number; dy: number } | null>(null);

  /** The years the current network actually spans. */
  const span = useMemo(() => {
    const ys = edges.flatMap((e) => [e.yearFrom, e.yearTo]).filter((y): y is number => y != null);
    return ys.length ? { min: Math.min(...ys), max: Math.max(...ys) } : null;
  }, [edges]);

  const visibleEdges = useMemo(() => {
    let list = showClaims ? edges : edges.filter((e) => !e.interpretive);
    if (year != null) {
      // Same rule as the server-side window: an edge with no dates survives
      // every year, because the archive not knowing when a relation ran is not
      // evidence that it had ended.
      list = list.filter(
        (e) =>
          (e.yearFrom == null && e.yearTo == null) ||
          ((e.yearFrom == null || e.yearFrom <= year) && (e.yearTo == null || e.yearTo >= year)),
      );
    }
    return list;
  }, [edges, showClaims, year]);

  /** Nodes still attached to something in this window, plus the root. */
  const visibleNodes = useMemo(() => {
    if (year == null) return nodes;
    const live = new Set<string>([rootKey]);
    for (const e of visibleEdges) {
      live.add(keyOf(e.from));
      live.add(keyOf(e.to));
    }
    return nodes.filter((n) => live.has(keyOf(n)));
  }, [nodes, visibleEdges, year, rootKey]);

  /** Which nodes and edges touch the hovered or selected node. */
  const focus = useMemo(() => {
    const key = hover ?? (sel?.kind === "node" ? sel.key : null);
    if (!key) return null;
    const nodeKeys = new Set([key]);
    const edgeIds = new Set<string>();
    for (const e of visibleEdges) {
      const f = keyOf(e.from);
      const t = keyOf(e.to);
      if (f === key || t === key) {
        edgeIds.add(e.edgeId);
        nodeKeys.add(f);
        nodeKeys.add(t);
      }
    }
    return { nodeKeys, edgeIds };
  }, [hover, sel, visibleEdges]);

  // --- layout ---------------------------------------------------------------
  // One effect owns both the layout map and the frame loop. They were split in
  // two and sequenced with a `ready` flag, which meant setting state inside an
  // effect purely to tell the next effect to start: cascading renders for no
  // reason. Positions never appear in the JSX, so there is nothing for the
  // server to mismatch on either.
  const restart = useRef<() => void>(() => {});

  useEffect(() => {
    const existing = layoutRef.current;
    const seeded = seedNodes(
      visibleNodes.map((n) => ({ key: keyOf(n), depth: n.depth, radius: NODE_R[n.type] ?? 16 })),
      W,
      H,
    );
    const next = new Map<string, LayoutNode>();
    for (const seed of seeded) {
      // A node already on screen keeps its place. Re-seeding everything on each
      // expansion would throw the whole picture away, and the reader would lose
      // the thing they were looking at.
      const prev = existing.get(seed.key);
      next.set(seed.key, prev ? { ...prev, depth: seed.depth, radius: seed.radius } : seed);
    }
    layoutRef.current = next;
    alpha.current = 1;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const links = visibleEdges.map((e) => ({ from: keyOf(e.from), to: keyOf(e.to) }));

    const paint = () => {
      const list = [...layoutRef.current.values()];
      const b = bounds(list);
      const pad = 48;
      // Fit the graph to the canvas, growing a small network as well as
      // shrinking a large one: five nodes floating in the middle of an empty
      // frame reads as an error, not as a small network. Capped so a two-node
      // graph does not become two dinner plates.
      const scale = Math.max(
        0.25,
        Math.min(
          1.6,
          (W - pad * 2) / Math.max(1, b.maxX - b.minX),
          (H - pad * 2) / Math.max(1, b.maxY - b.minY),
        ),
      );
      const ox = W / 2 - ((b.minX + b.maxX) / 2) * scale;
      const oy = H / 2 - ((b.minY + b.maxY) / 2) * scale;
      const at = (n: LayoutNode) => [n.x * scale + ox, n.y * scale + oy] as const;

      for (const [key, el] of nodeEls.current) {
        const n = layoutRef.current.get(key);
        if (!n) continue;
        const [x, y] = at(n);
        el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      }
      for (const e of visibleEdges) {
        const el = edgeEls.current.get(e.edgeId);
        const a = layoutRef.current.get(keyOf(e.from));
        const c = layoutRef.current.get(keyOf(e.to));
        if (!el || !a || !c) continue;
        const [x1, y1] = at(a);
        const [x2, y2] = at(c);
        el.setAttribute("x1", x1.toFixed(1));
        el.setAttribute("y1", y1.toFixed(1));
        el.setAttribute("x2", x2.toFixed(1));
        el.setAttribute("y2", y2.toFixed(1));
      }
    };

    if (reduced) {
      // No animation, but the layout still has to be solved: run it to
      // convergence in one go and paint the result once.
      const list = [...layoutRef.current.values()];
      for (let i = 0; i < 300; i++) step(list, links, { width: W, height: H, alpha: 0.6 });
      paint();
      restart.current = paint;
      return;
    }

    const tick = () => {
      const list = [...layoutRef.current.values()];
      const moved = step(list, links, { width: W, height: H, alpha: alpha.current });
      alpha.current *= 0.985;
      paint();
      // Stop once it is still. A settled graph must not keep a frame loop alive.
      if (moved > 0.4 * list.length || alpha.current > 0.08) {
        frame.current = requestAnimationFrame(tick);
      } else {
        frame.current = 0;
      }
    };
    // Dragging wakes the loop back up without touching state.
    restart.current = () => {
      if (!frame.current) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      restart.current = () => {};
    };
  }, [visibleNodes, visibleEdges]);

  // --- dragging: a pinned node stops moving, which is where section 12 starts -
  const onPointerDown = useCallback((key: string, e: React.PointerEvent) => {
    const n = layoutRef.current.get(key);
    if (!n) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { key, dx: 0, dy: 0 };
    n.pinned = true;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || !svg) return;
    const r = svg.getBoundingClientRect();
    const n = layoutRef.current.get(d.key);
    if (!n) return;
    n.x = ((e.clientX - r.left) / r.width) * W;
    n.y = ((e.clientY - r.top) / r.height) * H;
    n.vx = 0;
    n.vy = 0;
    alpha.current = Math.max(alpha.current, 0.5);
    restart.current();
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  // --- expansion ------------------------------------------------------------
  const expand = useCallback(
    async (n: GraphNode) => {
      const key = keyOf(n);
      setBusy(key);
      try {
        const res = await expandNodeAction(n.type, n.id, undefined, showClaims);
        setNodes((prev) => {
          const seen = new Map(prev.map((p) => [keyOf(p), p]));
          for (const incoming of res.nodes) {
            const k = keyOf(incoming);
            const old = seen.get(k);
            // Depth is measured from the ORIGINAL root, so a node reached again
            // by a shorter route moves inward rather than jumping outward.
            seen.set(k, old ? { ...incoming, depth: Math.min(old.depth, n.depth + incoming.depth) } : { ...incoming, depth: n.depth + incoming.depth });
          }
          return [...seen.values()];
        });
        setEdges((prev) => {
          const seen = new Map(prev.map((p) => [p.edgeId, p]));
          for (const e of res.edges) seen.set(e.edgeId, e);
          return [...seen.values()];
        });
        setDegree((prev) => ({ ...prev, ...res.degrees }));
        if (res.truncated) setWasTruncated(true);
      } finally {
        setBusy(null);
      }
    },
    [showClaims],
  );

  const selectEdge = useCallback(async (e: GraphEdge) => {
    setSel({ kind: "edge", id: e.edgeId });
    setEvidence(null);
    setEvidence(await edgeEvidenceAction(e.citationSubject, e.citationSubjectId));
  }, []);

  const selectedNode = sel?.kind === "node" ? nodes.find((n) => keyOf(n) === sel.key) : undefined;
  const selectedEdge = sel?.kind === "edge" ? edges.find((e) => e.edgeId === sel.id) : undefined;

  const hiddenClaims = edges.length - edges.filter((e) => !e.interpretive).length;

  return (
    // AutoLetters must not touch this subtree. It replaces a text node with
    // per-character spans; React then patches the text node it still holds a
    // reference to, which is no longer in the document, and the visible letters
    // freeze at whatever was rendered first. Every relationship in this panel
    // read "funded" because that was the first edge selected. The letter effect
    // belongs to prose, not to a surface whose text changes under the reader.
    <div className="net-wrap" data-auto="skip">
      <div className="net-toolbar">
        <span className="net-count">
          {visibleNodes.length} {visibleNodes.length === 1 ? "entity" : "entities"}, {visibleEdges.length}{" "}
          {visibleEdges.length === 1 ? "relationship" : "relationships"}
        </span>
        {hiddenClaims > 0 && (
          <label className="net-toggle">
            <input
              type="checkbox"
              checked={showClaims}
              onChange={(e) => setShowClaims(e.target.checked)}
            />
            Show {hiddenClaims} asserted {hiddenClaims === 1 ? "claim" : "claims"}
          </label>
        )}
        {wasTruncated && (
          <span className="net-warn">
            More relationships exist than are shown. Expand a specific entity to see them.
          </span>
        )}
      </div>

      {span && span.min !== span.max && (
        <div className="net-time">
          <label htmlFor="net-year">
            {year == null ? "Every recorded year" : `As recorded in ${year}`}
          </label>
          <input
            id="net-year"
            type="range"
            className="year-slider"
            min={span.min}
            max={span.max}
            value={year ?? span.max}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          {year != null && (
            <button type="button" onClick={() => setYear(null)}>
              Show every year
            </button>
          )}
          {year != null && (
            <span className="net-time-note">
              Relationships the archive holds no dates for stay on screen: a missing date is a gap
              in the record, not a relationship that had ended.
            </span>
          )}
        </div>
      )}

      <div className="net-stage">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="net-svg"
          role="img"
          aria-label="Relationship network. A text list of every relationship follows the diagram."
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <g className="net-edges">
            {visibleEdges.map((e) => {
              const dim = focus ? !focus.edgeIds.has(e.edgeId) : false;
              return (
                <line
                  key={e.edgeId}
                  ref={(el) => {
                    if (el) edgeEls.current.set(e.edgeId, el);
                    else edgeEls.current.delete(e.edgeId);
                  }}
                  className={[
                    "net-edge",
                    e.interpretive ? "is-claim" : "",
                    dim ? "is-dim" : "",
                    sel?.kind === "edge" && sel.id === e.edgeId ? "is-sel" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => selectEdge(e)}
                />
              );
            })}
          </g>
          <g className="net-nodes">
            {visibleNodes.map((n) => {
              const key = keyOf(n);
              const dim = focus ? !focus.nodeKeys.has(key) : false;
              const shown = visibleEdges.filter(
                (e) => keyOf(e.from) === key || keyOf(e.to) === key,
              ).length;
              const more = Math.max(0, (degree[key] ?? 0) - shown);
              return (
                <g
                  key={key}
                  ref={(el) => {
                    if (el) nodeEls.current.set(key, el);
                    else nodeEls.current.delete(key);
                  }}
                  className={[
                    "net-node",
                    `is-${n.type}`,
                    dim ? "is-dim" : "",
                    key === rootKey ? "is-root" : "",
                    sel?.kind === "node" && sel.key === key ? "is-sel" : "",
                    busy === key ? "is-busy" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  tabIndex={0}
                  role="button"
                  aria-label={`${n.label}, ${NODE_TYPE_LABELS[n.type] ?? n.type}${more ? `, ${more} further relationships` : ""}`}
                  onPointerDown={(e) => onPointerDown(key, e)}
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(key)}
                  onBlur={() => setHover(null)}
                  onClick={() => setSel({ kind: "node", key })}
                  onDoubleClick={() => expand(n)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") setSel({ kind: "node", key });
                    if (ev.key === " ") {
                      ev.preventDefault();
                      expand(n);
                    }
                  }}
                >
                  <circle className="net-halo" r={(NODE_R[n.type] ?? 16) + 7} />
                  <circle className="net-dot" r={NODE_R[n.type] ?? 16} />
                  {more > 0 && (
                    <circle className="net-more" r={4} cx={(NODE_R[n.type] ?? 16) * 0.72} cy={-(NODE_R[n.type] ?? 16) * 0.72} />
                  )}
                  <text className="net-label" y={(NODE_R[n.type] ?? 16) + 15}>
                    {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        <aside className="net-panel" aria-live="polite">
          {!sel && (
            <div className="net-panel-empty">
              <h3>Follow the evidence</h3>
              <p>
                Click a line to see the sources behind it. Click an entity to see what is recorded
                about it, and double click to pull in one more hop.
              </p>
              <p className="net-panel-note">
                A line means one recorded relationship and nothing more. Two lines meeting at an
                entity are two relationships, not a conclusion about either.
              </p>
            </div>
          )}
          {selectedNode && (
            <NodeCard
              node={selectedNode}
              hidden={Math.max(
                0,
                (degree[keyOf(selectedNode)] ?? 0) -
                  visibleEdges.filter(
                    (e) =>
                      keyOf(e.from) === keyOf(selectedNode) || keyOf(e.to) === keyOf(selectedNode),
                  ).length,
              )}
              busy={busy === keyOf(selectedNode)}
              onExpand={() => expand(selectedNode)}
              edges={visibleEdges.filter(
                (e) => keyOf(e.from) === keyOf(selectedNode) || keyOf(e.to) === keyOf(selectedNode),
              )}
              nodes={nodes}
              onPickEdge={selectEdge}
            />
          )}
          {selectedEdge && (
            <EvidencePanel edge={selectedEdge} nodes={nodes} evidence={evidence} />
          )}
        </aside>
      </div>

      {/* The diagram is not the only way to read this. */}
      <details className="net-list">
        <summary>Read the relationships as a list</summary>
        <ul>
          {visibleEdges.map((e) => {
            const from = nodes.find((n) => keyOf(n) === keyOf(e.from));
            const to = nodes.find((n) => keyOf(n) === keyOf(e.to));
            return (
              <li key={e.edgeId}>
                <button type="button" onClick={() => selectEdge(e)}>
                  {from?.label ?? e.from.id} {edgeLabel(e.kind, e.interpretive)}{" "}
                  {to?.label ?? e.to.id}
                </button>{" "}
                <span className={`ev ev-${e.evidenceStatus}`}>
                  {EVIDENCE_LABELS[e.evidenceStatus] ?? e.evidenceStatus}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}

function NodeCard({
  node,
  hidden,
  busy,
  onExpand,
  edges,
  nodes,
  onPickEdge,
}: {
  node: GraphNode;
  hidden: number;
  busy: boolean;
  onExpand: () => void;
  edges: GraphEdge[];
  nodes: GraphNode[];
  onPickEdge: (e: GraphEdge) => void;
}) {
  return (
    <div className="net-card">
      <p className="net-card-kind">{NODE_TYPE_LABELS[node.type] ?? node.type}</p>
      <h3 className="net-card-title">{node.label}</h3>
      {node.subKind && <p className="net-card-sub">{node.subKind.replace(/_/g, " ")}</p>}

      <button type="button" className="btn btn-secondary net-expand" onClick={onExpand} disabled={busy || hidden === 0}>
        {busy
          ? "Expanding…"
          : hidden === 0
            ? "Nothing further recorded"
            : `Expand: ${hidden} more ${hidden === 1 ? "relationship" : "relationships"}`}
      </button>

      <h4 className="net-card-h">Shown here</h4>
      <ul className="net-card-edges">
        {edges.map((e) => {
          const other = keyOf(e.from) === keyOf(node) ? e.to : e.from;
          const label = nodes.find((n) => keyOf(n) === keyOf(other))?.label ?? other.id;
          return (
            <li key={e.edgeId}>
              <button type="button" onClick={() => onPickEdge(e)}>
                {edgeLabel(e.kind, e.interpretive)} <strong>{label}</strong>
              </button>
              <span className={`ev ev-${e.evidenceStatus}`}>
                {EVIDENCE_LABELS[e.evidenceStatus] ?? e.evidenceStatus}
              </span>
            </li>
          );
        })}
      </ul>
      {edges.length === 0 && <p className="net-card-sub">No relationships in the current view.</p>}
    </div>
  );
}
