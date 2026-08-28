// One-off: enumerate WHICH D3 labels resolve to existing parties (the dry-run
// report printed only the count), so era-collision false matches are visible.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { matchKnownParty, parseEarlyRow, type KnownParty } from "../../src/lib/ingest/tcpd";

async function main() {
  const { db } = await import("../../src/lib/db");
  const { parties } = await import("../../src/lib/db/schema");
  const { parseCsv } = await import("../../src/lib/csv");
  const known: KnownParty[] = await db
    .select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation, isPseudo: parties.isPseudo })
    .from(parties);
  const rows = parseCsv(readFileSync("data/raw/tcpd/early/TCPD_IED_1951-62.csv", "utf8"));
  const labels = new Set<string>();
  for (const r of rows) {
    const p = parseEarlyRow(r, {});
    if (!("refused" in p)) labels.add(p.party);
  }
  for (const l of [...labels].sort()) {
    const m = matchKnownParty(known, l, l);
    if (m.kind === "one") console.log(`${l} -> ${m.party.id} (${m.party.name}, abbrev ${m.party.abbreviation})`);
    if (m.kind === "many") console.log(`${l} -> MANY ${m.parties.map((p) => p.id).join(",")}`);
  }
  process.exit(0);
}
main();
