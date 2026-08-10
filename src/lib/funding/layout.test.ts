import { describe, expect, it } from "vitest";

import { bounds, seedNodes, step } from "@/lib/funding/layout";
import {
  CLAIM_KIND_LABELS,
  edgeLabel,
  EVIDENCE_MEANING,
  formatAmount,
  formatPeriod,
} from "@/lib/funding/labels";

const mk = (keys: string[], depth = 1) =>
  keys.map((key) => ({ key, depth: key === keys[0] ? 0 : depth, radius: 18 }));

describe("seedNodes", () => {
  it("is deterministic, so an investigation is where you left it", () => {
    const a = seedNodes(mk(["org:a", "org:b", "person:c"]), 800, 600);
    const b = seedNodes(mk(["org:a", "org:b", "person:c"]), 800, 600);
    expect(a.map((n) => [n.x, n.y])).toEqual(b.map((n) => [n.x, n.y]));
  });

  it("pins the root at the centre and rings the rest around it", () => {
    const [root, ...rest] = seedNodes(mk(["org:a", "org:b", "org:c"]), 800, 600);
    expect(root.pinned).toBe(true);
    expect([root.x, root.y]).toEqual([400, 300]);
    for (const n of rest) expect(Math.hypot(n.x - 400, n.y - 300)).toBeGreaterThan(50);
  });

  it("separates two nodes that share a depth", () => {
    const [, b, c] = seedNodes(mk(["org:a", "org:b", "org:c"]), 800, 600);
    expect(Math.hypot(b.x - c.x, b.y - c.y)).toBeGreaterThan(20);
  });
});

describe("step", () => {
  it("settles rather than running forever", () => {
    const nodes = seedNodes(mk(["org:a", "org:b", "org:c", "org:d"]), 800, 600);
    const edges = [
      { from: "org:a", to: "org:b" },
      { from: "org:a", to: "org:c" },
      { from: "org:b", to: "org:d" },
    ];
    let alpha = 1;
    let moved = Infinity;
    for (let i = 0; i < 400 && moved > 0.01; i++) {
      moved = step(nodes, edges, { width: 800, height: 600, alpha });
      alpha *= 0.985;
    }
    expect(moved).toBeLessThan(1);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("pushes apart two nodes that start on the same point", () => {
    const nodes = seedNodes(mk(["org:a", "org:b"]), 800, 600);
    nodes[1].x = nodes[0].x;
    nodes[1].y = nodes[0].y;
    nodes[1].pinned = false;
    step(nodes, [], { width: 800, height: 600, alpha: 1 });
    expect(Math.hypot(nodes[1].x - nodes[0].x, nodes[1].y - nodes[0].y)).toBeGreaterThan(0);
  });

  it("leaves a pinned node where it was put", () => {
    const nodes = seedNodes(mk(["org:a", "org:b", "org:c"]), 800, 600);
    nodes[1].pinned = true;
    const at = { x: nodes[1].x, y: nodes[1].y };
    for (let i = 0; i < 50; i++) step(nodes, [], { width: 800, height: 600, alpha: 1 });
    expect({ x: nodes[1].x, y: nodes[1].y }).toEqual(at);
  });
});

describe("bounds", () => {
  it("survives an empty graph", () => {
    expect(bounds([])).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  });
});

describe("edge labels", () => {
  it("never gives a claim a bare verb", () => {
    for (const kind of Object.keys(CLAIM_KIND_LABELS)) {
      const label = edgeLabel(kind, true);
      expect(label).toMatch(/is said to|is the subject of/);
    }
  });

  it("phrases a documented relation plainly", () => {
    expect(edgeLabel("funded", false)).toBe("funded");
    expect(edgeLabel("trustee", false)).toBe("is a trustee of");
    expect(edgeLabel("participated_in", false)).toBe("took part in");
  });

  it("falls back readably rather than printing a database token", () => {
    expect(edgeLabel("some_new_kind", false)).toBe("some new kind");
  });

  it("gives coordination and control an asserting voice, never a plain one", () => {
    expect(edgeLabel("coordination", true)).toBe("is said to have coordinated with");
    expect(edgeLabel("control", true)).toBe("is said to control");
  });

  it("explains every evidence status in words", () => {
    for (const s of ["verified", "documented", "alleged", "disputed", "inferred", "unknown"]) {
      expect(EVIDENCE_MEANING[s]?.length ?? 0).toBeGreaterThan(20);
    }
  });
});

describe("formatting", () => {
  it("reads rupees at the scale filings use", () => {
    expect(formatAmount("5000000", "INR")).toBe("₹50 lakh");
    expect(formatAmount("25000000", "INR")).toBe("₹2.5 crore");
    expect(formatAmount("4200", "INR")).toBe("₹4,200");
  });

  it("keeps a foreign currency in its own currency", () => {
    expect(formatAmount("120000", "USD")).toBe("USD 1,20,000");
  });

  it("returns nothing rather than zero when no amount is recorded", () => {
    expect(formatAmount(null, "INR")).toBeNull();
    expect(formatAmount("not a number", "INR")).toBeNull();
  });

  it("describes an open-ended period without inventing an end", () => {
    expect(formatPeriod(2014, null)).toBe("since 2014");
    expect(formatPeriod(null, 2019)).toBe("until 2019");
    expect(formatPeriod(2016, 2016)).toBe("2016");
    expect(formatPeriod(2016, 2019)).toBe("2016 to 2019");
    expect(formatPeriod(null, null)).toBeNull();
  });
});
