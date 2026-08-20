import { describe, expect, it } from "vitest";

import {
  adjacency,
  bridges,
  componentOf,
  components,
  convergences,
  density,
  MIN_CYCLES_FOR_STRUCTURE,
} from "@/lib/funding/analysis";

const build = (keys: string[], pairs: Array<[string, string]>) =>
  adjacency(
    keys,
    pairs.map(([from, to]) => ({ from, to })),
  );

describe("components", () => {
  it("separates two unconnected groups", () => {
    const adj = build(["a", "b", "c", "d"], [["a", "b"], ["c", "d"]]);
    expect(components(adj)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("counts an isolated entity as its own group", () => {
    const adj = build(["a", "b", "lonely"], [["a", "b"]]);
    expect(components(adj)).toEqual([["a", "b"], ["lonely"]]);
  });

  it("is deterministic", () => {
    const adj = build(["d", "a", "c", "b"], [["a", "b"], ["c", "d"]]);
    expect(components(adj)).toEqual(components(adj));
  });
});

describe("bridges", () => {
  it("finds the entity holding two groups together", () => {
    //  a — b — X — c — d
    const adj = build(
      ["a", "b", "X", "c", "d"],
      [["a", "b"], ["b", "X"], ["X", "c"], ["c", "d"]],
    );
    const found = bridges(adj);
    expect(found.map((b) => b.key)).toContain("X");
    const x = found.find((b) => b.key === "X")!;
    expect(x.separates).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("reports nobody when every entity has a second route", () => {
    // A ring: remove any one and the rest still connect.
    const adj = build(
      ["a", "b", "c", "d"],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"]],
    );
    expect(bridges(adj)).toEqual([]);
  });

  it("does not call a leaf a bridge", () => {
    const adj = build(["hub", "leaf1", "leaf2"], [["hub", "leaf1"], ["hub", "leaf2"]]);
    expect(bridges(adj).map((b) => b.key)).toEqual(["hub"]);
  });

  it("states exactly who falls on each side, which is the whole finding", () => {
    const adj = build(
      ["p", "q", "X", "r"],
      [["p", "q"], ["q", "X"], ["X", "r"]],
    );
    const x = bridges(adj).find((b) => b.key === "X")!;
    expect(x.separates.flat().sort()).toEqual(["p", "q", "r"]);
    expect(x.separates).toHaveLength(2);
  });

  it("handles a graph with no edges at all", () => {
    expect(bridges(build(["a", "b"], []))).toEqual([]);
  });

  it("finds both cut vertices in a chain of three groups", () => {
    // a—X—b—Y—c
    const adj = build(
      ["a", "X", "b", "Y", "c"],
      [["a", "X"], ["X", "b"], ["b", "Y"], ["Y", "c"]],
    );
    expect(bridges(adj).map((b) => b.key).sort()).toEqual(["X", "Y", "b"]);
  });
});

describe("convergences", () => {
  it("reports an entity two equal-length routes reach", () => {
    //  root → a → target
    //  root → b → target
    const adj = build(
      ["root", "a", "b", "target"],
      [["root", "a"], ["root", "b"], ["a", "target"], ["b", "target"]],
    );
    const found = convergences(adj, "root");
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({ key: "target", arrivals: ["a", "b"], hops: 2 });
  });

  it("reports nothing when there is only one way through", () => {
    const adj = build(["root", "a", "b"], [["root", "a"], ["a", "b"]]);
    expect(convergences(adj, "root")).toEqual([]);
  });

  it("ignores a longer second route, which is a detour and not a convergence", () => {
    // root—a—t is two hops; root—b—c—t is three, so only one shortest route.
    const adj = build(
      ["root", "a", "b", "c", "t"],
      [["root", "a"], ["a", "t"], ["root", "b"], ["b", "c"], ["c", "t"]],
    );
    expect(convergences(adj, "root")).toEqual([]);
  });

  it("returns nothing for a root that is not in the graph", () => {
    expect(convergences(build(["a"], []), "missing")).toEqual([]);
  });
});

describe("componentOf", () => {
  it("labels every entity with its group", () => {
    const adj = build(["a", "b", "c"], [["a", "b"]]);
    const map = componentOf(adj);
    expect(map.get("a")).toBe(map.get("b"));
    expect(map.get("c")).not.toBe(map.get("a"));
  });
});

describe("density", () => {
  it("counts an isolated set as no edges and no cycles", () => {
    expect(density(build(["a", "b", "c"], []))).toMatchObject({
      nodes: 3,
      edges: 0,
      components: 3,
      cycles: 0,
      supportsStructure: false,
    });
  });

  it("reports zero cycles for a tree of any size", () => {
    // A hundred-node forest is exactly as unable to produce a meaningful
    // bridge as a three-node one, which is why the gate is cycles not nodes.
    const keys = Array.from({ length: 100 }, (_, i) => `n${i}`);
    const pairs = keys.slice(1).map((k, i) => [keys[i], k] as [string, string]);
    const d = density(build(keys, pairs));
    expect(d).toMatchObject({ nodes: 100, edges: 99, components: 1, cycles: 0 });
    expect(d.supportsStructure).toBe(false);
  });

  it("counts one cycle for a triangle", () => {
    const adj = build(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]);
    expect(density(adj)).toMatchObject({ edges: 3, components: 1, cycles: 1 });
  });

  it("adds cycles across separate groups", () => {
    // Two disjoint triangles: two independent cycles, two components.
    const adj = build(
      ["a", "b", "c", "x", "y", "z"],
      [["a", "b"], ["b", "c"], ["c", "a"], ["x", "y"], ["y", "z"], ["z", "x"]],
    );
    expect(density(adj)).toMatchObject({ components: 2, cycles: 2 });
  });

  it("ignores a repeated relationship between the same two entities", () => {
    // Two grants between one pair are one line on the canvas. Counting them
    // twice would report a cycle that nobody can see.
    const adj = adjacency(
      ["a", "b"],
      [{ from: "a", to: "b" }, { from: "b", to: "a" }, { from: "a", to: "b" }],
    );
    expect(density(adj)).toMatchObject({ edges: 1, cycles: 0 });
  });

  it("passes the threshold at exactly MIN_CYCLES_FOR_STRUCTURE", () => {
    // Four entities all joined to each other: 6 edges, 4 nodes, 1 component.
    const keys = ["a", "b", "c", "d"];
    const pairs: Array<[string, string]> = [];
    for (const i of keys) for (const j of keys) if (i < j) pairs.push([i, j]);
    const d = density(build(keys, pairs));
    expect(d.cycles).toBe(3);
    expect(MIN_CYCLES_FOR_STRUCTURE).toBe(3);
    expect(d.supportsStructure).toBe(true);
  });
});

describe("the forest premise the threshold rests on", () => {
  it("makes every internal entity a bridge, so the finding says only 'has two relationships'", () => {
    // A star: the centre plus five leaves. bridges() names the centre, which
    // is exactly what the degree already said. This is the vacuity the panel
    // now declines to print, not a defect in bridges().
    const leaves = ["a", "b", "c", "d", "e"];
    const adj = build(["hub", ...leaves], leaves.map((l) => ["hub", l] as [string, string]));
    expect(bridges(adj).map((b) => b.key)).toEqual(["hub"]);

    const internal = [...adj.entries()].filter(([, ns]) => ns.size > 1).map(([k]) => k);
    expect(bridges(adj).map((b) => b.key)).toEqual(internal);
    expect(density(adj).supportsStructure).toBe(false);
  });

  it("can never produce a convergence without a cycle", () => {
    // A balanced tree: every entity is reached from the root one way only, so
    // convergences is empty by structure rather than by chance.
    const adj = build(
      ["r", "a", "b", "a1", "a2", "b1", "b2"],
      [["r", "a"], ["r", "b"], ["a", "a1"], ["a", "a2"], ["b", "b1"], ["b", "b2"]],
    );
    expect(density(adj).cycles).toBe(0);
    expect(convergences(adj, "r")).toEqual([]);
  });
});
