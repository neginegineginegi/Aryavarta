import { describe, expect, it } from "vitest";

import {
  alreadyIngested,
  COUNT_KEYS,
  countsTable,
  hostOf,
  missingDatabaseUrlMessage,
  pagesToOpen,
  siteUrlFrom,
  snapshotTable,
} from "@/lib/ingest/go-plan";

describe("alreadyIngested (the stop rule in step 2)", () => {
  it("names every tcpd-* and eci-electoral-bonds-* slug, and nothing else", () => {
    expect(
      alreadyIngested(["cag-state-finances-2024-25", "tcpd-rsd-1-30", "gem-power-2026", "eci-electoral-bonds-2019-24", "tcpd-ied-1951-62"]),
    ).toEqual(["tcpd-rsd-1-30", "eci-electoral-bonds-2019-24", "tcpd-ied-1951-62"]);
    expect(alreadyIngested([])).toEqual([]);
    expect(alreadyIngested(["rbi-handbook-2025"])).toEqual([]);
  });
});

describe("hostOf (what a person types back to confirm the database)", () => {
  it("returns the host of a Postgres URL without any credential", () => {
    const h = hostOf("postgres://alice:s3cr3t@ep-quiet-pooler.ap-southeast-1.aws.neon.tech:5432/abhilekh?sslmode=require");
    expect(h).toBe("ep-quiet-pooler.ap-southeast-1.aws.neon.tech");
    expect(h).not.toMatch(/alice|s3cr3t/);
  });
  it("is null for text that is not a URL", () => {
    expect(hostOf("not a url")).toBeNull();
    expect(hostOf("")).toBeNull();
  });
});

describe("missingDatabaseUrlMessage", () => {
  it("names the Vercel path step by step and says the value goes into .env only", () => {
    const m = missingDatabaseUrlMessage(".env exists but has no DATABASE_URL");
    expect(m).toMatch(/Settings → Domains/);
    expect(m).toMatch(/Settings → Environment Variables → DATABASE_URL/);
    expect(m).toMatch(/BOTH projects/);
    expect(m).toMatch(/DATABASE_DRIVER="neon"/);
    expect(m).toMatch(/never into a chat/);
  });
});

describe("countsTable", () => {
  const before = { orgs: 10, "funding transactions": 24, rs_members: 0, rs_terms: null };
  it("prints before, after and the signed change", () => {
    const lines = countsTable(before, { orgs: 1304, "funding transactions": 18748, rs_members: 2412, rs_terms: 3531 });
    expect(lines[0]).toBe("| measure | before | after | change |");
    expect(lines).toContain("| orgs | 10 | 1304 | +1294 |");
    expect(lines).toContain("| funding transactions | 24 | 18748 | +18724 |");
    expect(lines).toContain("| rs_terms | table absent | 3531 | — |");
  });
  it("in a dry run never prints a predicted number as if observed", () => {
    const lines = countsTable(before, null);
    expect(lines[0]).toBe("| measure | now | after |");
    expect(lines.join("\n")).toMatch(/measured after the inserts in a real run/);
    expect(lines.join("\n")).not.toMatch(/\+\d/);
  });
  it("the before snapshot has no after column and no dry-run wording", () => {
    const lines = snapshotTable(before);
    expect(lines[0]).toBe("| measure | before |");
    expect(lines).toContain("| orgs | 10 |");
    expect(lines.join("\n")).not.toMatch(/real run|after/);
  });
  it("COUNT_KEYS names the measures the user asked for", () => {
    expect(COUNT_KEYS).toContain("orgs");
    expect(COUNT_KEYS).toContain("funding transactions");
    expect(COUNT_KEYS.some((k) => k.startsWith("graph edges"))).toBe(true);
    expect(COUNT_KEYS).toContain("rs_members");
  });
});

describe("siteUrlFrom", () => {
  it("accepts a real absolute site URL and strips a trailing slash", () => {
    expect(siteUrlFrom({ NEXT_PUBLIC_SITE_URL: "https://abhilekh.example.org/" })).toBe("https://abhilekh.example.org");
  });
  it("rejects the placeholder, localhost, paths and junk", () => {
    expect(siteUrlFrom({ NEXT_PUBLIC_SITE_URL: "https://your-domain.example" })).toBeNull();
    expect(siteUrlFrom({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toBeNull();
    expect(siteUrlFrom({ NEXT_PUBLIC_SITE_URL: "https://x.org/path" })).toBeNull();
    expect(siteUrlFrom({})).toBeNull();
  });
});

describe("pagesToOpen", () => {
  it("puts the cache refresh first and lists row-dependent pages only when a row was found", () => {
    const pages = pagesToOpen("https://abhilekh.example.org", { seatSlug: "assam", memberId: "RS00002", purchaserSlug: "future-gaming" });
    expect(pages[0].url).toBe("https://abhilekh.example.org/admin/import");
    expect(pages.map((p) => p.url)).toContain("https://abhilekh.example.org/rajya-sabha/assam");
    expect(pages.map((p) => p.url)).toContain("https://abhilekh.example.org/person/rs/RS00002");
    expect(pages.map((p) => p.url)).toContain("https://abhilekh.example.org/network/org/future-gaming");
    const bare = pagesToOpen(null, {});
    expect(bare.map((p) => p.url)).toEqual(["/admin/import", "/rajya-sabha", "/network", "/browse"]);
  });
});
