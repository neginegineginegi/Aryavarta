"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { edgeEvidenceAction, expandNodeAction } from "@/actions/network";
import type { EdgeEvidence } from "@/lib/db/queries/network";
import type { GraphEdge, GraphNode } from "@/lib/funding/graph-types";
import { edgeLabel, EVIDENCE_LABELS, NODE_TYPE_LABELS } from "@/lib/funding/labels";
import { adjacency, bridges, componentOf, components, convergences } from "@/lib/funding/analysis";
import * as investigation from "@/lib/funding/investigation";
import { bounds, packComponents, seedNodes, step, type LayoutNode } from "@/lib/funding/layout";

import { EvidencePanel } from "@/components/network/EvidencePanel";
import { StructurePanel } from "@/components/network/StructurePanel";

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
  collapsible = false,
}: {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  initialDegrees: Record<string, number>;
  /** Null renders the whole web: no centre, no depth rings, clusters left to
   *  separate themselves. Everything else behaves identically. */
  rootKey: string | null;
  truncated: boolean;
  /** Open with people folded away, so the canvas starts as organisations and
   *  the money and ownership between them, and each organisation opens to show
   *  who sits in it. Everything is already loaded; this is what is drawn. */
  collapsible?: boolean;
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
  const [showStructure, setShowStructure] = useState(false);
  /** Organisations the reader has opened, in a folded view. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  // Bumped when a drag ends after the layout has settled, to restart the frame
  // loop. State rather than a ref-held callback, because a ref that a hook has
  // captured cannot then be reassigned.
  const [wake, setWake] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const layoutRef = useRef<Map<string, LayoutNode>>(new Map());
  const nodeEls = useRef<Map<string, SVGGElement>>(new Map());
  const labelEls = useRef<Map<string, SVGTextElement>>(new Map());
  const edgeEls = useRef<Map<string, SVGLineElement>>(new Map());
  const frame = useRef(0);
  const alpha = useRef(1);
  const drag = useRef<{ key: string; moved: boolean } | null>(null);
  // How far apart the drawing is spread, and where it has been slid to. Only
  // positions are scaled, never the marks or the type: spreading a crowded
  // cluster apart has to make its labels readable, and magnifying the text
  // along with the gaps would leave them overlapping exactly as before.
  const view = useRef({ k: 1, tx: 0, ty: 0 });
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  /** The fit-to-frame transform the last paint used, so a drag can invert it. */
  const xform = useRef({ scale: 1, ox: 0, oy: 0 });
  const paintRef = useRef<(() => void) | null>(null);
  /** Only whether the view has been moved off its fit, so the Fit button can
   *  appear. The transform itself stays in the ref: a slide that re-rendered
   *  the tree on every pointer move would be a frame loop with extra steps. */
  const [viewMoved, setViewMoved] = useState(false);

  /** The years the current network actually spans. */
  const span = useMemo(() => {
    const ys = edges.flatMap((e) => [e.yearFrom, e.yearTo]).filter((y): y is number => y != null);
    return ys.length ? { min: Math.min(...ys), max: Math.max(...ys) } : null;
  }, [edges]);

  // --- folding people away ---------------------------------------------------
  // A person is drawn when one of the organisations they are recorded in has
  // been opened. One person is always ONE node: somebody who sits in two
  // organisations does not become two people because two squares were clicked.
  // Open both and the same node carries a line to each, which is the entire
  // point of drawing this at all.
  const typeOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(keyOf(n), n.type);
    return m;
  }, [nodes]);

  const folding = collapsible && !showAll;

  /**
   * Every edge the reader has asked to see, before the fold is applied.
   *
   * The year window belongs here rather than after the fold, so an organisation
   * opened in one year does not keep drawing people out of another. Same rule
   * as the server-side window: an edge with no dates survives every year,
   * because the archive not knowing when a relation ran is not evidence that it
   * had ended.
   */
  const drawable = useMemo(
    () =>
      edges.filter(
        (e) =>
          (showClaims || !e.interpretive) &&
          (year == null ||
            (e.yearFrom == null && e.yearTo == null) ||
            ((e.yearFrom == null || e.yearFrom <= year) &&
              (e.yearTo == null || e.yearTo >= year))),
      ),
    [edges, showClaims, year],
  );

  /** Every key the fold allows on screen. */
  const unfolded = useMemo(() => {
    if (!folding) return null;
    const keep = new Set<string>();
    for (const n of nodes) if (n.type !== "person") keep.add(keyOf(n));
    for (const e of drawable) {
      const f = keyOf(e.from);
      const t = keyOf(e.to);
      if (expanded.has(f) && typeOf.get(t) === "person") keep.add(t);
      if (expanded.has(t) && typeOf.get(f) === "person") keep.add(f);
    }
    return keep;
  }, [folding, nodes, drawable, expanded, typeOf]);

  /**
   * Organisations that are open AND still have somebody to show.
   *
   * Derived rather than stored, so dragging the year past the last recorded
   * position closes the organisation instead of leaving it standing open with
   * nothing under it, and dragging back opens it again. The reader's click is
   * remembered; what it currently yields is recomputed.
   */
  const openOrgs = useMemo(() => {
    const out = new Set<string>();
    if (!folding) return out;
    for (const e of drawable) {
      const f = keyOf(e.from);
      const t = keyOf(e.to);
      if (expanded.has(f) && typeOf.get(t) === "person") out.add(f);
      if (expanded.has(t) && typeOf.get(f) === "person") out.add(t);
    }
    return out;
  }, [folding, drawable, expanded, typeOf]);

  /** People not on screen, and the organisations each one is waiting behind. */
  const folded = useMemo(() => {
    if (!unfolded) return { people: 0, byOrg: new Map<string, number>() };
    const byOrg = new Map<string, number>();
    const people = new Set<string>();
    for (const e of drawable) {
      const f = keyOf(e.from);
      const t = keyOf(e.to);
      const person = typeOf.get(f) === "person" ? f : typeOf.get(t) === "person" ? t : null;
      if (!person || unfolded.has(person)) continue;
      const org = person === f ? t : f;
      people.add(person);
      byOrg.set(org, (byOrg.get(org) ?? 0) + 1);
    }
    return { people: people.size, byOrg };
  }, [unfolded, drawable, typeOf]);

  /**
   * Which group each entity belongs to, measured on the WHOLE graph rather than
   * on what is drawn. Two organisations joined only by a person are in the same
   * group even while that person is folded away, which is what makes "open
   * everything in this group" open the thing the reader means.
   */
  const clusterOf = useMemo(
    () =>
      componentOf(
        adjacency(
          nodes.map(keyOf),
          drawable.map((e) => ({ from: keyOf(e.from), to: keyOf(e.to) })),
        ),
      ),
    [nodes, drawable],
  );

  const visibleEdges = useMemo(
    () =>
      unfolded
        ? drawable.filter((e) => unfolded.has(keyOf(e.from)) && unfolded.has(keyOf(e.to)))
        : drawable,
    [drawable, unfolded],
  );

  /** Nodes still attached to something in this window, plus the root. */
  const visibleNodes = useMemo(() => {
    const base = unfolded ? nodes.filter((n) => unfolded.has(keyOf(n))) : nodes;
    if (year == null) return base;
    const live = new Set<string>(rootKey ? [rootKey] : []);
    for (const e of visibleEdges) {
      live.add(keyOf(e.from));
      live.add(keyOf(e.to));
    }
    return base.filter((n) => live.has(keyOf(n)));
  }, [nodes, unfolded, visibleEdges, year, rootKey]);

  const adj = useMemo(
    () =>
      adjacency(
        visibleNodes.map(keyOf),
        visibleEdges.map((e) => ({ from: keyOf(e.from), to: keyOf(e.to) })),
      ),
    [visibleNodes, visibleEdges],
  );

  /** Structure of what is currently drawn. Recomputed, never stored: a shape
   *  that outlived the view it described would be an assertion. */
  const structure = useMemo(
    () => ({
      bridges: bridges(adj),
      convergences: rootKey ? convergences(adj, rootKey) : [],
      componentCount: new Set(componentOf(adj).values()).size,
    }),
    [adj, rootKey],
  );

  /** One centre per unconnected group, for the whole-web view only. A rooted
   *  view has a centre already: the entity the reader started from. */
  const homes = useMemo(
    () => (rootKey === null ? packComponents(components(adj), W, H) : undefined),
    [adj, rootKey],
  );

  const bridgeKeys = useMemo(
    () => new Set(structure.bridges.map((b) => b.key)),
    [structure.bridges],
  );

  /** Draw order. The entity being read goes last so its full name lands on top
   *  of its neighbours: SVG paints in document order and has no z-index. */
  const drawNodes = useMemo(() => {
    const top = hover ?? (sel?.kind === "node" ? sel.key : null);
    if (!top) return visibleNodes;
    const one = visibleNodes.find((n) => keyOf(n) === top);
    return one ? [...visibleNodes.filter((n) => keyOf(n) !== top), one] : visibleNodes;
  }, [visibleNodes, hover, sel]);

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

  // --- the researcher's own working state ------------------------------------
  // Read straight from the browser store. It lives there and nowhere else; see
  // src/lib/funding/investigation.ts for why.
  const workKey = rootKey ?? "web:all";
  const stored = useSyncExternalStore(
    investigation.subscribe,
    useCallback(() => investigation.snapshot(workKey), [workKey]),
    investigation.serverSnapshot,
  );
  const empty = useMemo(() => investigation.emptyInvestigation(workKey, ""), [workKey]);
  const work = stored ?? empty;

  const edit = useCallback(
    (fn: (draft: investigation.Investigation) => investigation.Investigation) => {
      const base = investigation.snapshot(workKey) ?? investigation.emptyInvestigation(workKey, "");
      investigation.save({ ...fn(base), updatedAt: new Date().toISOString() });
    },
    [workKey],
  );

  const setNote = useCallback(
    (key: string, text: string) =>
      edit((d) => {
        const notes = { ...d.notes };
        if (text.trim()) notes[key] = text;
        else delete notes[key];
        return { ...d, notes };
      }),
    [edit],
  );

  const toggleFlag = useCallback(
    (key: string, flag: "needs_source" | "follow_up") =>
      edit((d) => {
        const flags = { ...d.flags };
        if (flags[key] === flag) delete flags[key];
        else flags[key] = flag;
        return { ...d, flags };
      }),
    [edit],
  );

  const clearWork = useCallback(() => {
    investigation.clear(workKey);
  }, [workKey]);

  // --- layout ---------------------------------------------------------------
  // One effect owns both the layout map and the frame loop. They were split in
  // two and sequenced with a `ready` flag, which meant setting state inside an
  // effect purely to tell the next effect to start: cascading renders for no
  // reason. Positions never appear in the JSX, so there is nothing for the
  // server to mismatch on either.

  useEffect(() => {
    const existing = layoutRef.current;
    const seeded = seedNodes(
      visibleNodes.map((n) => ({ key: keyOf(n), depth: n.depth, radius: NODE_R[n.type] ?? 16 })),
      W,
      H,
      homes,
    );
    const next = new Map<string, LayoutNode>();
    for (const seed of seeded) {
      // A node already on screen keeps its place. Re-seeding everything on each
      // expansion would throw the whole picture away, and the reader would lose
      // the thing they were looking at.
      const prev = existing.get(seed.key);
      const base = prev
        ? {
            ...prev,
            depth: seed.depth,
            radius: seed.radius,
            homeX: seed.homeX,
            homeY: seed.homeY,
            homePull: seed.homePull,
          }
        : seed;
      // A position the researcher dragged a node to outranks the solver.
      const pin = work.pins[seed.key];
      // `pinned` is derived from the saved pins every time, so clearing an
      // investigation genuinely releases the nodes rather than leaving them
      // stuck wherever they were dropped.
      next.set(seed.key, {
        ...base,
        x: pin?.x ?? base.x,
        y: pin?.y ?? base.y,
        pinned: pin ? true : seed.pinned,
      });
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
      xform.current = { scale, ox, oy };
      const v = view.current;
      const at = (n: LayoutNode) =>
        [(n.x * scale + ox) * v.k + v.tx, (n.y * scale + oy) * v.k + v.ty] as const;

      for (const [key, el] of nodeEls.current) {
        const n = layoutRef.current.get(key);
        if (!n) continue;
        const [x, y] = at(n);
        el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);

        // Names are placed on the side of the entity that faces away from the
        // middle of its cluster, so a ring of entities around a hub writes its
        // labels outward into empty canvas instead of stacking them all under
        // the nodes, on top of each other.
        const label = labelEls.current.get(key);
        if (!label) continue;
        const ax = n.x - (n.homeX ?? W / 2);
        const ay = n.y - (n.homeY ?? H / 2);
        if (Math.abs(ax) > Math.abs(ay) * 1.25) {
          label.setAttribute("x", (ax > 0 ? n.radius + 7 : -(n.radius + 7)).toFixed(0));
          label.setAttribute("y", "4");
          label.setAttribute("text-anchor", ax > 0 ? "start" : "end");
        } else {
          label.setAttribute("x", "0");
          label.setAttribute("y", (ay < 0 ? -(n.radius + 9) : n.radius + 15).toFixed(0));
          label.setAttribute("text-anchor", "middle");
        }
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

    // Spreading and sliding the drawing must repaint even after the solver has
    // parked, so the handlers reach the current paint through this.
    paintRef.current = paint;

    if (reduced) {
      // No animation, but the layout still has to be solved: run it to
      // convergence in one go and paint the result once.
      const list = [...layoutRef.current.values()];
      for (let i = 0; i < 300; i++) step(list, links, { width: W, height: H, alpha: 0.6 });
      paint();
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
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [visibleNodes, visibleEdges, work.pins, wake, homes]);

  // --- spreading and sliding ------------------------------------------------
  // Neither touches the layout. The solver's positions are the archive's shape;
  // this only changes how much canvas that shape is drawn across, so a crowded
  // corner can be opened up without the diagram becoming a different diagram.

  const applyView = useCallback((next: { k: number; tx: number; ty: number }) => {
    view.current = next;
    setViewMoved(next.k !== 1 || next.tx !== 0 || next.ty !== 0);
    paintRef.current?.();
  }, []);

  /** Spread about a point, so what the reader is looking at stays put. */
  const spreadBy = useCallback(
    (factor: number, px = W / 2, py = H / 2) => {
      const v = view.current;
      const k = Math.min(4, Math.max(0.5, v.k * factor));
      const f = k / v.k;
      applyView({ k, tx: px - (px - v.tx) * f, ty: py - (py - v.ty) * f });
    },
    [applyView],
  );

  const resetView = useCallback(() => applyView({ k: 1, tx: 0, ty: 0 }), [applyView]);

  // Native listener, because a passive wheel handler cannot stop the page from
  // scrolling underneath. Held modifier only: taking over an ordinary scroll
  // would trap a reader trying to get past the diagram.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      spreadBy(
        e.deltaY < 0 ? 1.12 : 1 / 1.12,
        ((e.clientX - r.left) / r.width) * W,
        ((e.clientY - r.top) / r.height) * H,
      );
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [spreadBy]);

  const onBackgroundDown = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pan.current = {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
      tx: view.current.tx,
      ty: view.current.ty,
    };
  }, []);

  // --- dragging: a pinned node stops moving, which is where section 12 starts -
  const onPointerDown = useCallback((key: string, e: React.PointerEvent) => {
    const n = layoutRef.current.get(key);
    if (!n) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // Not pinned yet. A click that never moves is someone reading the entity,
    // and pinning it there would quietly freeze a node the reader only looked
    // at. Pinning happens on the first movement.
    drag.current = { key, moved: false };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const py = ((e.clientY - r.top) / r.height) * H;

      const p = pan.current;
      if (p) {
        view.current = { ...view.current, tx: p.tx + (px - p.x), ty: p.ty + (py - p.y) };
        setViewMoved(true);
        paintRef.current?.();
        return;
      }

      const d = drag.current;
      if (!d) return;
      const n = layoutRef.current.get(d.key);
      if (!n) return;
      d.moved = true;
      n.pinned = true;
      // Back out the fit and the spread, so the node lands under the pointer
      // rather than wherever those two transforms happen to put it.
      const { scale, ox, oy } = xform.current;
      const v = view.current;
      n.x = ((px - v.tx) / v.k - ox) / scale;
      n.y = ((py - v.ty) / v.k - oy) / scale;
      n.vx = 0;
      n.vy = 0;
      alpha.current = Math.max(alpha.current, 0.5);
      if (frame.current === 0) setWake((w) => w + 1);
    },
    [],
  );

  const onPointerUp = useCallback(() => {
    pan.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    const n = layoutRef.current.get(d.key);
    if (n) edit((draft) => ({ ...draft, pins: { ...draft.pins, [d.key]: { x: n.x, y: n.y } } }));
  }, [edit]);

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

  /**
   * Open or close one entity in a folded view.
   *
   * An organisation opens to the people recorded in it. A person opens the
   * other organisations they are recorded in, which is how you follow somebody
   * from one square to the next: nothing new is fetched and nothing new is
   * asserted, the drawing just stops leaving things out.
   */
  const fold = useCallback(
    (n: GraphNode) => {
      const key = keyOf(n);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (n.type === "person") {
          for (const e of edges) {
            const f = keyOf(e.from);
            const t = keyOf(e.to);
            if (f === key && typeOf.get(t) !== "person") next.add(t);
            if (t === key && typeOf.get(f) !== "person") next.add(f);
          }
          return next;
        }
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [edges, typeOf],
  );

  const selectEdge = useCallback(async (e: GraphEdge) => {
    setSel({ kind: "edge", id: e.edgeId });
    setEvidence(null);
    setEvidence(await edgeEvidenceAction(e.citationSubject, e.citationSubjectId));
  }, []);

  const selectedNode = sel?.kind === "node" ? nodes.find((n) => keyOf(n) === sel.key) : undefined;

  /**
   * Opening a whole group at once, for the reader who wants the cluster rather
   * than one organisation at a time. It reveals what is already recorded and
   * nothing else: same nodes, same edges, drawn instead of folded.
   */
  const cluster = useMemo(() => {
    if (!folding || !selectedNode) return null;
    const group = clusterOf.get(keyOf(selectedNode));
    if (group === undefined) return null;
    const orgKeys = nodes
      .filter((n) => n.type !== "person" && clusterOf.get(keyOf(n)) === group)
      .map(keyOf);
    const closed = orgKeys.filter((k) => !expanded.has(k));
    const waiting = new Set<string>();
    for (const e of drawable) {
      const f = keyOf(e.from);
      const t = keyOf(e.to);
      const person = typeOf.get(f) === "person" ? f : typeOf.get(t) === "person" ? t : null;
      if (!person || unfolded?.has(person)) continue;
      const org = person === f ? t : f;
      if (clusterOf.get(org) === group) waiting.add(person);
    }
    return {
      orgs: closed.length,
      people: waiting.size,
      onOpen: () => setExpanded((prev) => new Set([...prev, ...orgKeys])),
    };
  }, [folding, selectedNode, clusterOf, nodes, expanded, drawable, typeOf, unfolded]);
  const selectedEdge = sel?.kind === "edge" ? edges.find((e) => e.edgeId === sel.id) : undefined;

  const hiddenClaims = edges.length - edges.filter((e) => !e.interpretive).length;

  return (
    <div className="net-wrap">
      <div className="net-toolbar">
        <span className="net-count">
          {visibleNodes.length} {visibleNodes.length === 1 ? "entity" : "entities"}, {visibleEdges.length}{" "}
          {visibleEdges.length === 1 ? "relationship" : "relationships"}
        </span>
        {collapsible && (
          <label className="net-toggle">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Show everyone at once
          </label>
        )}
        {folding && folded.people > 0 && (
          <span className="net-folded">
            {folded.people} {folded.people === 1 ? "person is" : "people are"} folded away. Click an
            organisation to see who is recorded in it.
          </span>
        )}
        {folding && openOrgs.size > 0 && (
          <button type="button" className="net-plain" onClick={() => setExpanded(new Set())}>
            Fold them back
          </button>
        )}
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
        <label className="net-toggle">
          <input
            type="checkbox"
            checked={showStructure}
            onChange={(e) => setShowStructure(e.target.checked)}
          />
          Show structure
        </label>
        {investigation.countEntries(work) > 0 && (
          <span className="net-work-status">
            {investigation.countEntries(work)} saved in this browser
            <button type="button" onClick={clearWork}>
              Clear
            </button>
          </span>
        )}
        {wasTruncated && (
          <span className="net-warn">
            More relationships exist than are shown. Expand a specific entity to see them.
          </span>
        )}
        <span className="net-spread">
          <button
            type="button"
            onClick={() => spreadBy(1 / 1.25)}
            aria-label="Draw the diagram closer together"
            title="Closer together"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => spreadBy(1.25)}
            aria-label="Spread the diagram further apart"
            title="Further apart"
          >
            +
          </button>
          {viewMoved && (
            <button type="button" onClick={resetView}>
              Fit
            </button>
          )}
        </span>
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
          {/* Drag anywhere that is not an entity to slide the whole drawing. */}
          <rect
            className="net-bg"
            x={0}
            y={0}
            width={W}
            height={H}
            onPointerDown={onBackgroundDown}
            onClick={() => setSel(null)}
          />
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
            {drawNodes.map((n) => {
              const key = keyOf(n);
              const dim = focus ? !focus.nodeKeys.has(key) : false;
              const open = hover === key || (sel?.kind === "node" && sel.key === key);
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
                    showStructure && bridgeKeys.has(key) ? "is-bridge" : "",
                    folding && openOrgs.has(key) ? "is-open" : "",
                    folding && (folded.byOrg.get(key) ?? 0) > 0 ? "is-foldable" : "",
                    work.flags[key] ? `is-flag-${work.flags[key]}` : "",
                    sel?.kind === "node" && sel.key === key ? "is-sel" : "",
                    busy === key ? "is-busy" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  tabIndex={0}
                  role="button"
                  aria-label={`${n.label}, ${NODE_TYPE_LABELS[n.type] ?? n.type}${
                    folding && (folded.byOrg.get(key) ?? 0) > 0
                      ? `, ${folded.byOrg.get(key)} people folded away, activate to show them`
                      : more
                        ? `, ${more} further relationships`
                        : ""
                  }`}
                  onPointerDown={(e) => onPointerDown(key, e)}
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(key)}
                  onBlur={() => setHover(null)}
                  onClick={() => {
                    setSel({ kind: "node", key });
                    if (folding) fold(n);
                  }}
                  onDoubleClick={() => !folding && expand(n)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      setSel({ kind: "node", key });
                      if (folding) fold(n);
                    }
                    if (ev.key === " ") {
                      ev.preventDefault();
                      if (folding) fold(n);
                      else expand(n);
                    }
                  }}
                >
                  <NodeMark type={n.type} r={NODE_R[n.type] ?? 16} />
                  {more > 0 && (
                    <circle className="net-more" r={4} cx={(NODE_R[n.type] ?? 16) * 0.72} cy={-(NODE_R[n.type] ?? 16) * 0.72} />
                  )}
                  {/* Truncated at rest so a crowded canvas stays readable, whole
                      the moment the reader points at it. */}
                  <text
                    className="net-label"
                    ref={(el) => {
                      if (el) labelEls.current.set(key, el);
                      else labelEls.current.delete(key);
                    }}
                    y={(NODE_R[n.type] ?? 16) + 15}
                  >
                    {open || n.label.length <= 26 ? n.label : `${n.label.slice(0, 25)}…`}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        <aside className="net-panel" aria-live="polite">
          {/* With people folded away, two organisations joined only by a person
              are drawn apart. Describing that as separate groups would be
              stating something the archive does not hold, so the shape is not
              described at all until everyone is on screen. */}
          {!sel && showStructure && folding && folded.people > 0 && (
            <div className="net-panel-empty">
              <h3>Not while people are folded away</h3>
              <p>
                Two organisations that share a person are drawn apart in this view. Calling them
                separate groups would say something the record does not: that nothing joins them.
              </p>
              <p className="net-panel-note">
                <button type="button" className="net-plain" onClick={() => setShowAll(true)}>
                  Show everyone at once
                </button>{" "}
                to see the shape of what is recorded.
              </p>
            </div>
          )}
          {!sel && showStructure && !(folding && folded.people > 0) && (
            <StructurePanel
              hasRoot={rootKey !== null}
              bridges={structure.bridges}
              convergences={structure.convergences}
              componentCount={structure.componentCount}
              labelOf={(k) => visibleNodes.find((n) => keyOf(n) === k)?.label ?? k}
              onSelect={(k) => setSel({ kind: "node", key: k })}
            />
          )}
          {!sel && !showStructure && (
            <div className="net-panel-empty">
              <h3>Follow the evidence</h3>
              <p>
                {folding
                  ? "Click an organisation to open it: the people recorded in it appear, and a person recorded in two organisations is one node with a line to each. Click a line to see the sources behind it."
                  : "Click a line to see the sources behind it. Click an entity to see what is recorded about it, and double click to pull in one more hop."}
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
              fold={
                folding
                  ? {
                      open: openOrgs.has(keyOf(selectedNode)),
                      waiting:
                        selectedNode.type === "person"
                          ? 0
                          : (folded.byOrg.get(keyOf(selectedNode)) ?? 0),
                      isPerson: selectedNode.type === "person",
                      onToggle: () => fold(selectedNode),
                      cluster,
                    }
                  : null
              }
              onExpand={() => expand(selectedNode)}
              edges={visibleEdges.filter(
                (e) => keyOf(e.from) === keyOf(selectedNode) || keyOf(e.to) === keyOf(selectedNode),
              )}
              nodes={nodes}
              onPickEdge={selectEdge}
              note={work.notes[keyOf(selectedNode)] ?? ""}
              flag={work.flags[keyOf(selectedNode)]}
              onNote={setNote}
              onFlag={toggleFlag}
            />
          )}
          {selectedEdge && (
            <>
              <EvidencePanel edge={selectedEdge} nodes={nodes} evidence={evidence} />
              <WorkNotes
                subjectKey={selectedEdge.edgeId}
                note={work.notes[selectedEdge.edgeId] ?? ""}
                flag={work.flags[selectedEdge.edgeId]}
                onNote={setNote}
                onFlag={toggleFlag}
              />
            </>
          )}
        </aside>
      </div>

      <div className="net-legend-row">
        <Legend showStructure={showStructure} />
        <p className="net-legend-note">
          Drag the background to slide the diagram. Hold Ctrl or Cmd and scroll to spread it apart.
        </p>
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

/**
 * The mark for one entity.
 *
 * Organisations are squares and people are circles, and that is the whole
 * encoding: shape says what kind of thing it is, nothing else. Nothing here is
 * sized, weighted or coloured by how much is recorded about an entity, because
 * a mark that grew with its number of relationships would be an influence score
 * drawn as a picture, and the archive does not hold one.
 */
function NodeMark({ type, r }: { type: string; r: number }) {
  if (type === "org" || type === "party") {
    const s = r * 1.78;
    return (
      <>
        <rect className="net-halo" x={-(s / 2 + 7)} y={-(s / 2 + 7)} width={s + 14} height={s + 14} rx={9} />
        <rect className="net-dot" x={-s / 2} y={-s / 2} width={s} height={s} rx={5} />
      </>
    );
  }
  return (
    <>
      <circle className="net-halo" r={r + 7} />
      <circle className="net-dot" r={r} />
    </>
  );
}

/** What every mark on the canvas means, in the canvas's own terms. */
function Legend({ showStructure }: { showStructure: boolean }) {
  return (
    <ul className="net-legend">
      <li>
        <svg viewBox="-12 -12 24 24" aria-hidden="true">
          <rect className="net-dot" x={-8} y={-8} width={16} height={16} rx={3} />
        </svg>
        Organisation
      </li>
      <li>
        <svg viewBox="-12 -12 24 24" aria-hidden="true">
          <circle className="net-dot" r={8} />
        </svg>
        Person
      </li>
      <li>
        <svg viewBox="0 -12 40 24" aria-hidden="true">
          <line className="net-edge" x1={2} y1={0} x2={38} y2={0} />
        </svg>
        A recorded relationship
      </li>
      <li>
        <svg viewBox="0 -12 40 24" aria-hidden="true">
          <line className="net-edge is-claim" x1={2} y1={0} x2={38} y2={0} />
        </svg>
        A claim someone made, not a record
      </li>
      <li>
        <svg viewBox="-12 -12 24 24" aria-hidden="true">
          <circle className="net-dot" r={8} />
          <circle className="net-more" r={3} cx={6} cy={-6} />
        </svg>
        More relationships than are drawn
      </li>
      {showStructure && (
        <li>
          <svg viewBox="-12 -12 24 24" aria-hidden="true">
            <circle className="net-dot" r={8} strokeDasharray="4 2.5" strokeWidth={2.2} />
          </svg>
          Holds two groups together
        </li>
      )}
    </ul>
  );
}

/**
 * A researcher's note on one entity or one relationship.
 *
 * Deliberately plain, and deliberately labelled. The line under the box is the
 * important part: a note sits beside the record and is never part of it, and
 * somebody returning to an investigation months later needs to know at a glance
 * which of the words on their screen are the archive's and which are their own.
 */
function WorkNotes({
  subjectKey,
  note,
  flag,
  onNote,
  onFlag,
}: {
  subjectKey: string;
  note: string;
  flag: "needs_source" | "follow_up" | undefined;
  onNote: (key: string, text: string) => void;
  onFlag: (key: string, flag: "needs_source" | "follow_up") => void;
}) {
  return (
    <div className="net-notes">
      <h4 className="net-card-h">Your note</h4>
      <textarea
        className="net-note-box"
        rows={3}
        value={note}
        placeholder="What you want to remember about this"
        onChange={(e) => onNote(subjectKey, e.target.value)}
      />
      <div className="net-note-flags">
        <button
          type="button"
          className={flag === "needs_source" ? "is-on" : ""}
          onClick={() => onFlag(subjectKey, "needs_source")}
        >
          Needs a source
        </button>
        <button
          type="button"
          className={flag === "follow_up" ? "is-on" : ""}
          onClick={() => onFlag(subjectKey, "follow_up")}
        >
          Follow up
        </button>
      </div>
      <p className="net-note-scope">
        Notes and flags stay in this browser. They are never sent anywhere and are not part of the
        archive.
      </p>
    </div>
  );
}

/** The full record behind a node, where one exists. */
function recordHref(node: GraphNode): string | null {
  if (node.type === "org" && node.slug) return `/network/org/${node.slug}`;
  if (node.type === "person" && node.slug) return `/network/person/${node.slug}`;
  if (node.type === "party") return `/party/${node.id}`;
  if (node.type === "state") return `/state/${node.id}`;
  return null;
}

function NodeCard({
  node,
  hidden,
  busy,
  fold,
  onExpand,
  edges,
  nodes,
  onPickEdge,
  note,
  flag,
  onNote,
  onFlag,
}: {
  node: GraphNode;
  hidden: number;
  busy: boolean;
  /** Present only in a folded view, where opening is a drawing decision rather
   *  than a fetch: everything is already loaded. */
  fold: {
    open: boolean;
    waiting: number;
    isPerson: boolean;
    onToggle: () => void;
    cluster: { orgs: number; people: number; onOpen: () => void } | null;
  } | null;
  onExpand: () => void;
  edges: GraphEdge[];
  nodes: GraphNode[];
  onPickEdge: (e: GraphEdge) => void;
  note: string;
  flag: "needs_source" | "follow_up" | undefined;
  onNote: (key: string, text: string) => void;
  onFlag: (key: string, flag: "needs_source" | "follow_up") => void;
}) {
  return (
    <div className="net-card">
      <p className="net-card-kind">{NODE_TYPE_LABELS[node.type] ?? node.type}</p>
      <h3 className="net-card-title">{node.label}</h3>
      {node.subKind && <p className="net-card-sub">{node.subKind.replace(/_/g, " ")}</p>}

      {fold ? (
        <button
          type="button"
          className="btn btn-secondary net-expand"
          onClick={fold.onToggle}
          disabled={!fold.isPerson && !fold.open && fold.waiting === 0}
        >
          {fold.isPerson
            ? "Open every organisation they are recorded in"
            : fold.open
              ? "Close this organisation"
              : fold.waiting === 0
                ? "No people are recorded in it"
                : `Open: ${fold.waiting} ${fold.waiting === 1 ? "person" : "people"} recorded in it`}
        </button>
      ) : null}
      {fold?.cluster && fold.cluster.orgs > 0 && fold.cluster.people > 0 && (
        <p className="net-card-sub">
          <button type="button" className="net-plain" onClick={fold.cluster.onOpen}>
            Open the rest of this group
          </button>{" "}
          ({fold.cluster.orgs} more{" "}
          {fold.cluster.orgs === 1 ? "organisation" : "organisations"}, {fold.cluster.people}{" "}
          {fold.cluster.people === 1 ? "person" : "people"})
        </p>
      )}
      {!fold && (
        <button type="button" className="btn btn-secondary net-expand" onClick={onExpand} disabled={busy || hidden === 0}>
          {busy
            ? "Expanding…"
            : hidden === 0
              ? "Nothing further recorded"
              : `Expand: ${hidden} more ${hidden === 1 ? "relationship" : "relationships"}`}
        </button>
      )}
      {recordHref(node) && (
        <p className="net-card-sub">
          <a href={recordHref(node)!} className="rec-link">
            Open the full record
          </a>
        </p>
      )}

      <h4 className="net-card-h">Shown here</h4>
      <ul className="net-card-edges">
        {edges.map((e) => {
          // Which end this entity sits on decides the sentence. Read from the
          // wrong end, "funded" turns a grant received into a grant given, and
          // "is chief executive of" points at the person instead of the
          // organisation. A line in this archive states one direction.
          const outbound = keyOf(e.from) === keyOf(node);
          const other = outbound ? e.to : e.from;
          const label = nodes.find((n) => keyOf(n) === keyOf(other))?.label ?? other.id;
          return (
            <li key={e.edgeId}>
              <button type="button" onClick={() => onPickEdge(e)}>
                {outbound ? (
                  <>
                    {edgeLabel(e.kind, e.interpretive)} <strong>{label}</strong>
                  </>
                ) : (
                  <>
                    <strong>{label}</strong> {edgeLabel(e.kind, e.interpretive)} this
                  </>
                )}
              </button>
              <span className={`ev ev-${e.evidenceStatus}`}>
                {EVIDENCE_LABELS[e.evidenceStatus] ?? e.evidenceStatus}
              </span>
            </li>
          );
        })}
      </ul>
      {edges.length === 0 && <p className="net-card-sub">No relationships in the current view.</p>}
      <WorkNotes
        subjectKey={keyOf(node)}
        note={note}
        flag={flag}
        onNote={onNote}
        onFlag={onFlag}
      />
    </div>
  );
}
