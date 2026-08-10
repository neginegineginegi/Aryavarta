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

export function seedNodes(
  input: Array<{ key: string; depth: number; radius: number }>,
  width: number,
  height: number,
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

  return input.map((n) => {
    const ring = byDepth.get(n.depth) ?? [];
    const i = ring.indexOf(n.key);
    const spread = ring.length || 1;
    // Even spacing round the ring, nudged by the hash so two rings do not line
    // up into spokes.
    const angle = ((i + 0.5) / spread) * Math.PI * 2 + hash(n.key) * 0.6;
    const r = n.depth === 0 ? 0 : RING * n.depth;
    return {
      key: n.key,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      depth: n.depth,
      pinned: n.depth === 0, // the root holds the centre
      radius: n.radius,
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
    const pull = CENTRE_PULL * o.alpha * (1 / (1 + n.depth));
    n.vx += (cx - n.x) * pull;
    n.vy += (cy - n.y) * pull;

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
