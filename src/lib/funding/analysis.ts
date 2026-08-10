/**
 * Structural analysis of a loaded neighbourhood.
 *
 * Everything here is a statement about the SHAPE of what has been recorded, and
 * about nothing else. The distinction matters more in this file than anywhere
 * in the layer, because "bridge" and "convergence" are the two words most
 * likely to be read as accusations.
 *
 * The defence is that each result carries the exact fact that produced it, and
 * that fact is checkable by hand. A bridge is not a claim that someone connects
 * two worlds; it is the observation that if you removed that entity from the
 * diagram, these named entities would have no recorded relationship path to
 * those named entities. A reader can verify that by looking. Nothing here
 * infers intent, coordination, or importance, and none of it is stored: it is
 * recomputed from the current view every time.
 *
 * Pure and dependency-free so it can be tested exhaustively without a database
 * or a browser.
 */

export type Adjacency = Map<string, Set<string>>;

/** Undirected adjacency. Direction matters for reading an edge, never for asking
 *  whether two entities are connected at all. */
export function adjacency(
  nodeKeys: string[],
  edges: Array<{ from: string; to: string }>,
): Adjacency {
  const adj: Adjacency = new Map(nodeKeys.map((k) => [k, new Set<string>()]));
  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to) || e.from === e.to) continue;
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }
  return adj;
}

/** Connected components, each a sorted list of keys. Order is deterministic. */
export function components(adj: Adjacency, skip?: string): string[][] {
  const seen = new Set<string>(skip ? [skip] : []);
  const out: string[][] = [];
  for (const start of [...adj.keys()].sort()) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop()!;
      group.push(k);
      for (const n of [...(adj.get(k) ?? [])].sort()) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    out.push(group.sort());
  }
  return out.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

export type Bridge = {
  key: string;
  /** The groups that would have no recorded path to each other without it.
   *  This IS the finding: everything else is presentation. */
  separates: string[][];
};

/**
 * Entities whose removal would split the drawn network.
 *
 * Articulation points, by the standard depth-first low-link test, then the
 * components recomputed with that entity removed so the result can state
 * exactly which entities fall on which side.
 *
 * A bridge in a diagram of forty relationships is not a bridge in the world.
 * It is a bridge in what has been recorded so far, and an entity can stop being
 * one the moment somebody files a source. The interface has to say that; this
 * function only reports the shape.
 */
export function bridges(adj: Adjacency): Bridge[] {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const found = new Set<string>();
  let timer = 0;

  const keys = [...adj.keys()].sort();

  for (const root of keys) {
    if (disc.has(root)) continue;
    // Iterative, because a long chain of entities would otherwise put the
    // recursion depth at the mercy of the data.
    const stack: Array<{ node: string; iter: Iterator<string> }> = [];
    disc.set(root, timer);
    low.set(root, timer);
    timer++;
    parent.set(root, null);
    let rootChildren = 0;
    stack.push({ node: root, iter: [...adj.get(root)!].sort()[Symbol.iterator]() });

    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = top.iter.next();
      if (next.done) {
        stack.pop();
        const p = parent.get(top.node) ?? null;
        if (p !== null) {
          low.set(p, Math.min(low.get(p)!, low.get(top.node)!));
          // A non-root entity is a cut vertex when one of its children cannot
          // reach past it by any other route.
          if (low.get(top.node)! >= disc.get(p)! && p !== root) found.add(p);
        }
        continue;
      }
      const child = next.value;
      if (child === parent.get(top.node)) continue;
      if (disc.has(child)) {
        low.set(top.node, Math.min(low.get(top.node)!, disc.get(child)!));
        continue;
      }
      if (top.node === root) rootChildren++;
      parent.set(child, top.node);
      disc.set(child, timer);
      low.set(child, timer);
      timer++;
      stack.push({ node: child, iter: [...adj.get(child)!].sort()[Symbol.iterator]() });
    }
    // The starting entity is a cut vertex only if the search left it more than
    // once: two children it never reconnected.
    if (rootChildren > 1) found.add(root);
  }

  return [...found]
    .sort()
    .map((key) => ({
      key,
      separates: components(adj, key).filter((g) => g.length > 0),
    }))
    .filter((b) => b.separates.length > 1);
}

export type Convergence = {
  key: string;
  /** The last entity on each distinct shortest route from the root. */
  arrivals: string[];
  hops: number;
};

/**
 * Entities that more than one shortest chain from the root reaches.
 *
 * Two routes arriving at the same place is a fact about the diagram. It is not
 * evidence that the routes are related to each other, that anyone intended them
 * to meet, or that the entity they meet at did anything at all. The plural in
 * "arrivals" is the whole content of the finding.
 */
export function convergences(adj: Adjacency, root: string): Convergence[] {
  if (!adj.has(root)) return [];
  const depth = new Map<string, number>([[root, 0]]);
  const parents = new Map<string, Set<string>>();
  let frontier = [root];

  while (frontier.length) {
    const next: string[] = [];
    for (const k of frontier) {
      for (const n of [...(adj.get(k) ?? [])].sort()) {
        const d = depth.get(k)! + 1;
        const known = depth.get(n);
        if (known === undefined) {
          depth.set(n, d);
          parents.set(n, new Set([k]));
          next.push(n);
        } else if (known === d) {
          // Same distance by another route: that is the convergence.
          parents.get(n)!.add(k);
        }
      }
    }
    frontier = next;
  }

  return [...parents.entries()]
    .filter(([, ps]) => ps.size > 1)
    .map(([key, ps]) => ({ key, arrivals: [...ps].sort(), hops: depth.get(key)! }))
    .sort((a, b) => a.hops - b.hops || a.key.localeCompare(b.key));
}

/**
 * How many separate groups the drawn network falls into.
 *
 * Useful on its own: a reader who can see that what looks like one network is
 * actually three unconnected ones is much less likely to read a shape into it.
 */
export function componentOf(adj: Adjacency): Map<string, number> {
  const out = new Map<string, number>();
  components(adj).forEach((group, i) => group.forEach((k) => out.set(k, i)));
  return out;
}
