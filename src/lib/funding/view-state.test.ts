import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEW,
  decodeView,
  encodeView,
  isDefaultView,
  type NetworkView,
} from "@/lib/funding/view-state";

const params = (qs: string) => new URLSearchParams(qs);
const view = (over: Partial<NetworkView> = {}): NetworkView => ({ ...DEFAULT_VIEW, ...over });

describe("encodeView", () => {
  it("writes nothing for an untouched view", () => {
    expect(encodeView(DEFAULT_VIEW).toString()).toBe("");
  });

  it("keeps parameters it does not own", () => {
    // `root` is server state and belongs to the page, not to this module.
    const out = encodeView(view({ structure: true }), params("root=org%3A1"));
    expect(out.get("root")).toBe("org:1");
    expect(out.get("structure")).toBe("1");
  });

  it("removes a parameter when its control returns to the default", () => {
    const out = encodeView(DEFAULT_VIEW, params("claims=1&year=1998&open=org%3A1"));
    expect(out.toString()).toBe("");
  });

  it("sorts open keys so the same view always gives the same link", () => {
    const a = encodeView(view({ open: ["org:b", "org:a"] })).toString();
    const b = encodeView(view({ open: ["org:a", "org:b"] })).toString();
    expect(a).toBe(b);
  });

  it("round-trips every field", () => {
    const v = view({ year: 2011, claims: true, structure: true, everyone: true, open: ["org:x", "person:y"] });
    expect(decodeView(encodeView(v))).toEqual(v);
  });
});

describe("decodeView", () => {
  it("returns the default for an empty query", () => {
    expect(decodeView(params(""))).toEqual(DEFAULT_VIEW);
  });

  it("falls back to every year rather than a window when the year is junk", () => {
    // A window the reader did not choose hides relationships without saying so,
    // so a bad year must not resolve to a nearby one.
    for (const bad of ["", "abc", "0", "1599", "2201", "1998.5", "-2000", "NaN"]) {
      expect(decodeView(params(`year=${encodeURIComponent(bad)}`)).year).toBeNull();
    }
    expect(decodeView(params("year=1998")).year).toBe(1998);
  });

  it("treats any flag value other than 1 as off", () => {
    expect(decodeView(params("claims=true&structure=yes&everyone=0")).claims).toBe(false);
    expect(decodeView(params("claims=true")).structure).toBe(false);
    expect(decodeView(params("claims=1")).claims).toBe(true);
  });

  it("drops open keys that are not shaped like an archive reference", () => {
    const v = decodeView(params(`open=${encodeURIComponent("org:1,notakey,person:2,a:b:c,,org:")}`));
    expect(v.open).toEqual(["org:1", "person:2"]);
  });

  it("de-duplicates and sorts open keys", () => {
    const v = decodeView(params(`open=${encodeURIComponent("org:b,org:a,org:b")}`));
    expect(v.open).toEqual(["org:a", "org:b"]);
  });

  it("never throws on hostile input", () => {
    for (const qs of ["open=%%%", "year=%E2%80%A6", "open=" + "x".repeat(5000), "claims"]) {
      expect(() => decodeView(params(qs))).not.toThrow();
    }
  });
});

describe("isDefaultView", () => {
  it("is true only when every control is where it started", () => {
    expect(isDefaultView(DEFAULT_VIEW)).toBe(true);
    expect(isDefaultView(view({ year: 2000 }))).toBe(false);
    expect(isDefaultView(view({ open: ["org:1"] }))).toBe(false);
    expect(isDefaultView(view({ structure: true }))).toBe(false);
  });
});

describe("what the URL is not allowed to carry", () => {
  it("has no field for a note, a pin or a flag", () => {
    // investigation.ts keeps those in the browser on purpose: they are the
    // researcher's own reasoning, unreviewed and uncited. A shareable link
    // carrying them is the first step toward them being read as record.
    const keys = Object.keys(DEFAULT_VIEW);
    expect(keys.sort()).toEqual(["claims", "everyone", "open", "structure", "year"]);
    for (const banned of ["note", "notes", "pin", "pins", "flag", "flags", "comment"]) {
      expect(keys).not.toContain(banned);
    }
  });

  it("ignores such a parameter if somebody adds one to a link by hand", () => {
    const out = encodeView(decodeView(params("note=they+are+connected&flag=org%3A1")));
    expect(out.has("note")).toBe(false);
    expect(out.has("flag")).toBe(false);
  });
});
