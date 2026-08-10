import { describe, expect, it } from "vitest";

import {
  adjacency,
  bridges,
  componentOf,
  components,
  convergences,
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
