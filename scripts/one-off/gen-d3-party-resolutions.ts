// One-off: generate data/raw/tcpd/PARTY_RESOLUTIONS.csv from the measured
// matches, with the SP era-collision overridden to create. Run once, then the
// file is hand-maintained and reviewed at the gate.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
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
  const lines = ["label,disposition,party_id,reason"];
  for (const l of [...labels].sort()) {
    if (l === "SP") {
      lines.push('SP,create,,"era collision: the 1951-62 SP is the Socialist Party (Lohia/JP lineage, merged into PSP 1952), not the 1992 Samajwadi Party the abbreviation matches today"');
      continue;
    }
    const m = matchKnownParty(known, l, l);
    if (m.kind === "one") lines.push(`${l},resolve,${m.party.id},`);
    else lines.push(`${l},create,,`);
  }
  writeFileSync("data/raw/tcpd/PARTY_RESOLUTIONS.csv", lines.join("\n") + "\n");
  console.log(`${lines.length - 1} dispositions written`);
  process.exit(0);
}
main();
