/**
 * Force-directed layout for the network graph.
 *
 * Written rather than imported for two reasons. Every graph library ships its
 * own canvas, its own event model and its own visual defaults, and section 14
 * asks for the archive's language rather than a second one. And the motion
 * matters here: the handoff's rule is that the graph settles, never bounces, so
 * the integrator needs to be ours to tune.
 *
 * Deterministic on purpose. Initial positions come from a hash of the node key,
 * not from Math.random, so the same network lays out the same way every time.
 * A researcher who returns to an investigation should find it where they left
 * it, and a layout that reshuffles on every visit is one nobody can describe to
 * a colleague.
 */

export type LayoutNode = {
  key: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Hops from the root. Drives the ring the node starts on and how hard the
   *  centre pulls it, so the root stays legibly central. */
  depth: number;
  /** Dragged nodes stop moving. Section 12's pinning starts here. */
  pinned: boolean;
  radius: number;
  /** Where this node is pulled toward. Unset means the canvas centre, which is
   *  right for a rooted view. The whole-web view gives every group its own
   *  centre instead, so unconnected groups end up in their own patch of canvas
   *  rather than piled into one ball that looks like a single network. */
  homeX?: number;
  homeY?: number;
  /** How hard, chosen so the group settles at exactly the radius it was given. */
  homePull?: number;
};

export type LayoutEdge = { from: string; to: string };

/** FNV-1a. Small, stable across runs and platforms, and good enough to scatter. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

const RING = 132; // px between depth rings

/**
 * How much canvas a group of n entities is given.
 *
 * Area grows with n, which is the only allocation that keeps a twenty-entity
 * group as readable as a three-entity one: labels are a fixed size on screen,
 * so a group drawn at half the area per entity has its names collide however
 * elegant the rest of the layout is.
 *
 * The solver is calibrated against this number rather than left to find its own
 * spread, so what a group is given and what it takes are the same thing by
 * construction.
 */
export function groupRadius(n: number): number {
  // Area, not radius, is what scales with n. A fixed term added on top would
  // quietly hand small groups more room per entity than large ones, which is
  // the wrong way round: the large group is the one whose labels collide.
  return n <= 1 ? 74 : 12 + 52 * Math.sqrt(n);
}

/**
 * A centre for each disconnected group, packed so the groups do not overlap.
 *
 * This is the whole-web view's answer to a real problem: with one shared centre
 * and nothing else to separate them, five unconnected groups collapse into one
 * hairball, and a hairball is a picture of a network that does not exist. Each
 * group gets its own patch of canvas, sized by how many entities it holds, and
 * the gaps between them are the archive saying it holds no relationship there.
 *
 * Deterministic: groups are ordered by size then by their first key, and laid
 * out in rows, so the same archive draws the same way every time.
 */
export function packComponents(
  groups: string[][],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const items = groups
    .map((g) => ({ g, r: groupRadius(g.length) }))
    .sort((a, b) => b.r - a.r || (a.g[0] ?? "").localeCompare(b.g[0] ?? ""));

  const gap = 44;

  const shelf = (rowWidth: number) => {
    const out: Array<{ g: string[]; x: number; y: number }> = [];
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let widest = 0;
    for (const it of items) {
      if (x > 0 && x + it.r * 2 > rowWidth) {
        x = 0;
        y += rowHeight + gap;
        rowHeight = 0;
      }
      out.push({ g: it.g, x: x + it.r, y: y + it.r });
      x += it.r * 2 + gap;
      widest = Math.max(widest, x - gap);
      rowHeight = Math.max(rowHeight, it.r * 2);
    }
    return { out, w: widest, h: y + rowHeight };
  };

  // Try every row width the groups can actually produce and keep the packing
  // shaped most like the frame. A packing that is the wrong shape is not merely
  // untidy: the whole drawing is scaled down to fit the frame afterwards, and
  // the labels do not scale with it, so wasted canvas comes straight out of how
  // far apart two names are drawn.
  const widths = new Set<number>();
  let running = 0;
  for (const it of items) {
    running += it.r * 2 + gap;
    widths.add(running - gap);
  }
  const want = width / Math.max(1, height);
  let best = shelf(Math.max(...widths));
  for (const w of widths) {
    const cand = shelf(w);
    const score = Math.abs(cand.w / Math.max(1, cand.h) - want);
    if (score < Math.abs(best.w / Math.max(1, best.h) - want)) best = cand;
  }
  const placed = best.out;

  // Centre the packing on the canvas. Cosmetic, since the view is fitted to the
  // drawing afterwards, but it keeps a single-group archive exactly where a
  // reader expects it.
  const xs = placed.map((p) => p.x);
  const ys = placed.map((p) => p.y);
  const ox = width / 2 - (Math.min(...xs, 0) + Math.max(...xs, 0)) / 2;
  const oy = height / 2 - (Math.min(...ys, 0) + Math.max(...ys, 0)) / 2;

  const out = new Map<string, { x: number; y: number }>();
  for (const p of placed) {
    for (const key of p.g) out.set(key, { x: p.x + ox, y: p.y + oy });
  }
  return out;
}

export function seedNodes(
  input: Array<{ key: string; depth: number; radius: number }>,
  width: number,
  height: number,
  /** Per-node group centre, from packComponents. Absent for a rooted view. */
  homes?: Map<string, { x: number; y: number }>,
): LayoutNode[] {
  const cx = width / 2;
  const cy = height / 2;
  // Group by depth so a ring's nodes spread over the whole circle instead of
  // clumping wherever their hashes happened to land.
  const byDepth = new Map<number, string[]>();
  for (const n of input) {
    const list = byDepth.get(n.depth) ?? [];
    list.push(n.key);
    byDepth.set(n.depth, list);
  }
  for (const list of byDepth.values()) list.sort();

  // In a grouped layout the rings are per group, so a twenty-entity group does
  // not seed its nodes on top of a two-entity one.
  const byHome = new Map<string, string[]>();
  if (homes) {
    for (const n of input) {
      const h = homes.get(n.key);
      const id = h ? `${h.x},${h.y}` : "none";
      const list = byHome.get(id) ?? [];
      list.push(n.key);
      byHome.set(id, list);
    }
    for (const list of byHome.values()) list.sort();
  }

  return input.map((n) => {
    const home = homes?.get(n.key);
    const ring = home
      ? (byHome.get(`${home.x},${home.y}`) ?? [])
      : (byDepth.get(n.depth) ?? []);
    const i = ring.indexOf(n.key);
    const spread = ring.length || 1;
    // Even spacing round the ring, nudged by the hash so two rings do not line
    // up into spokes.
    const angle = ((i + 0.5) / spread) * Math.PI * 2 + hash(n.key) * 0.6;
    const r = home
      ? // Seed on a circle whose size follows the group's, so the solver starts
        // from something already close to spread out.
        (spread === 1 ? 0 : 26 + 13 * spread)
      : n.depth === 0
        ? 0
        : RING * n.depth;
    const ox = home?.x ?? cx;
    const oy = home?.y ?? cy;
    return {
      key: n.key,
      x: ox + Math.cos(angle) * r,
      y: oy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      depth: n.depth,
      // The root holds the centre. A grouped layout has no root, so nothing is
      // pinned and every group is free to find its own shape.
      pinned: home ? false : n.depth === 0,
      radius: n.radius,
      homeX: home?.x,
      homeY: home?.y,
      // Balance the group's own repulsion against its allotted radius: n nodes
      // pushing outward at REPULSION/d² settle where the linear pull matches,
      // which is at n·REPULSION/pull = R³. Solving for the pull is what keeps a
      // large group from collapsing into its centre and a small one from
      // wandering out of its patch.
      homePull: home ? Math.min(0.05, (spread * REPULSION) / groupRadius(spread) ** 3) : undefined,
    };
  });
}

export type StepOptions = {
  width: number;
  height: number;
  /** Falls each frame so the graph settles instead of jittering forever. */
  alpha: number;
};

const REPULSION = 5200;
const SPRING = 0.045;
const SPRING_LENGTH = 118;
const CENTRE_PULL = 0.006;
const DAMPING = 0.82;
const MAX_SPEED = 18;

/**
 * One integration step. Returns the total movement, so a caller can stop the
 * loop once the graph is still rather than burning frames on a settled layout.
 *
 * Velocity is capped and damped hard. Section 15 asks for settling rather than
 * bouncing, and an uncapped repulsion term throws nodes off screen the moment
 * two of them start close together.
 */
export function step(nodes: LayoutNode[], edges: LayoutEdge[], o: StepOptions): number {
  const index = new Map(nodes.map((n) => [n.key, n]));
  const cx = o.width / 2;
  const cy = o.height / 2;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      // Two entities in different groups do not push each other around: the
      // packed group centres already hold the groups apart, and letting a large
      // group shove a small one out of its reserved patch is how five separate
      // groups turn back into one drifting mass.
      if (a.homeX !== undefined && b.homeX !== undefined) {
        if (a.homeX !== b.homeX || a.homeY !== b.homeY) continue;
      }
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        // Exactly coincident nodes have no direction to push apart along, so
        // give them one from their keys rather than from a random number.
        dx = hash(a.key + b.key) - 0.5;
        dy = hash(b.key + a.key) - 0.5;
        d2 = dx * dx + dy * dy || 1;
      }
      const d = Math.sqrt(d2);
      const force = (REPULSION * o.alpha) / d2;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  for (const e of edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const target = SPRING_LENGTH + a.radius + b.radius;
    const force = (d - target) * SPRING * o.alpha;
    const fx = (dx / d) * force;
    const fy = (dy / d) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  let movement = 0;
  for (const n of nodes) {
    if (n.pinned) {
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    // Deeper nodes are pulled less, so distance from the root stays readable.
    // A node with its own group centre is pulled to that instead, harder,
    // because nothing else keeps two unconnected groups from drifting into
    // each other and reading as one.
    const hx = n.homeX;
    const hy = n.homeY;
    const grouped = hx !== undefined && hy !== undefined;
    const pull = grouped
      ? (n.homePull ?? CENTRE_PULL) * o.alpha
      : CENTRE_PULL * o.alpha * (1 / (1 + n.depth));
    n.vx += ((grouped ? hx : cx) - n.x) * pull;
    n.vy += ((grouped ? hy : cy) - n.y) * pull;

    n.vx *= DAMPING;
    n.vy *= DAMPING;
    const speed = Math.hypot(n.vx, n.vy);
    if (speed > MAX_SPEED) {
      n.vx = (n.vx / speed) * MAX_SPEED;
      n.vy = (n.vy / speed) * MAX_SPEED;
    }
    n.x += n.vx;
    n.y += n.vy;
    movement += Math.abs(n.vx) + Math.abs(n.vy);
  }
  return movement;
}

/** The box the laid-out graph occupies, for fitting it into the viewport. */
export function bounds(nodes: LayoutNode[]) {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    maxY = Math.max(maxY, n.y + n.radius);
  }
  return { minX, minY, maxX, maxY };
}
