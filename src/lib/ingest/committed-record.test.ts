import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The delivered record of every ingest front must be IN the repository.
 *
 * `data/raw/*` is ignored wholesale so payloads (and their PII columns)
 * never land in git, and each front then whitelists its own record back in.
 * That is one `!` line per file, written by hand, and the Rajya Sabha front
 * shipped once with the whitelist missing: the spec, the loader and the
 * mapping decisions were committed while the manifest, the captured terms,
 * the findings and both mapping files stayed invisible on one machine.
 *
 * Nothing about that failure announces itself — `git status` is clean, the
 * build is green, and the loss only surfaces when someone clones. So the
 * rule gets a test: a file matching the committed-record shapes below may
 * not be gitignored.
 */

const RAW_ROOT = join(process.cwd(), "data", "raw");

/** The record every front carries: what the drop was, under which terms,
 *  what was found in it, and every human mapping decision. */
const COMMITTED_RECORD = [
  /^MANIFEST\.csv$/,
  /^TERMS.*\.md$/, // TERMS.md, TERMS_LOKDHABA.md
  /FINDINGS\.md$/, // FINDINGS.md, D3_FINDINGS.md
  /_LINKS\.csv$/, // STATE_LINKS.csv, PARTY_LINKS.csv
  /_RESOLUTIONS\.csv$/, // PARTY_RESOLUTIONS.csv
];

function committedRecordFiles(): string[] {
  if (!existsSync(RAW_ROOT)) return [];
  const out: string[] = [];
  for (const front of readdirSync(RAW_ROOT, { withFileTypes: true })) {
    if (!front.isDirectory()) continue;
    for (const entry of readdirSync(join(RAW_ROOT, front.name), { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (COMMITTED_RECORD.some((re) => re.test(entry.name))) out.push(join(RAW_ROOT, front.name, entry.name));
    }
  }
  return out.sort();
}

/** `git check-ignore` exits 0 and echoes the paths it would ignore, 1 when
 *  it would ignore none. Anything else is a real failure worth surfacing.
 *
 *  `--no-index` is what makes this a test of the RULES rather than of the
 *  current index: without it git reports an already-tracked file as "not
 *  ignored" no matter what .gitignore says, so deleting a whitelist line
 *  would pass here and only bite the next person to clone. */
function ignoredAmong(paths: string[]): string[] {
  if (paths.length === 0) return [];
  try {
    const out = execFileSync("git", ["check-ignore", "--no-index", "--", ...paths], { encoding: "utf8" });
    return out.split("\n").filter((l) => l.trim() !== "").map((p) => relative(process.cwd(), p));
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    if (err.status === 1) return []; // nothing ignored: the good case
    throw new Error(`git check-ignore failed: ${err.stderr ?? String(e)}`);
  }
}

describe("the committed record of every ingest front", () => {
  it("finds the record files it is supposed to guard", () => {
    // A glob that matches nothing would make the guard below vacuously pass.
    expect(committedRecordFiles().length).toBeGreaterThan(0);
  });

  it("is not gitignored — a manifest, terms, findings or mapping file must reach the repository", () => {
    const ignored = ignoredAmong(committedRecordFiles());
    expect(
      ignored,
      `these files are the delivered record of an ingest and .gitignore is swallowing them; add a "!" whitelist line for each in .gitignore:\n  ${ignored.join("\n  ")}`,
    ).toEqual([]);
  });
});
