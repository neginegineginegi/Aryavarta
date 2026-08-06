import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseCsv } from "@/lib/csv";

/**
 * Runtime lookup into data/inbox/party_colors.csv, the curated sheet of
 * conventional party colors. Imports consult it the moment a party is
 * created, so a party named in the sheet never appears with an auto-assigned
 * palette color, not even between an import and the next deploy. The sheet is
 * traced into the server bundle via outputFileTracingIncludes in next.config.
 */

export type CanonicalParty = { color: string; abbreviation: string | null };

let cache: Map<string, CanonicalParty> | null = null;

function sheet(): Map<string, CanonicalParty> {
  if (cache) return cache;
  cache = new Map();
  try {
    const p = join(process.cwd(), "data", "inbox", "party_colors.csv");
    if (existsSync(p)) {
      for (const r of parseCsv(readFileSync(p, "utf8"))) {
        const name = r.party_name?.trim();
        const hex = r.primary_hex?.trim();
        if (!name || !hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
        cache.set(name.toLowerCase(), {
          color: hex,
          abbreviation: r.abbreviation?.trim() || null,
        });
      }
    }
  } catch {
    // Unreadable sheet degrades to auto-assigned colors; never block an import.
  }
  return cache;
}

/** Conventional color + abbreviation for a party name, or null if uncurated. */
export function canonicalParty(name: string): CanonicalParty | null {
  return sheet().get(name.trim().toLowerCase()) ?? null;
}
