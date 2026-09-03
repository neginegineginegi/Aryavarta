// One-off: generate data/raw/tcpd-rs/PARTY_RESOLUTIONS.csv proposals from
// the measured labels + the live parties table. Exact matches propose
// resolve; hand-curated era/variant rows carry their evidence; the rest
// create verbatim. Every row is a PROPOSAL pending the stage-1 gate.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { matchKnownParty, type KnownParty } from "../../src/lib/ingest/tcpd";
import { parseRsRow, type RsRow } from "../../src/lib/ingest/rajya-sabha";

const HAND: Record<string, { partyId: string | null; disposition: "resolve" | "create"; reason: string }> = {
  Congress: { partyId: "indian-national-congress", disposition: "resolve", reason: "the party's common name in early RS records (663 rows, 1952-96); human pairing, matcher would not make it" },
  "CONG(I)": { partyId: null, disposition: "create", reason: "A4 doctrine: INC(I) never becomes INC; create verbatim. Anachronism reported: rows from 1956 predate the 1978 split. Gate may overrule to a windowed resolve" },
  "CONG(O)": { partyId: null, disposition: "create", reason: "Congress (Organisation), a distinct 1969-77 party; created verbatim" },
  "CONG (S)": { partyId: null, disposition: "create", reason: "Congress (Socialist), distinct; created verbatim" },
  "IND.": { partyId: "ind", disposition: "resolve", reason: "trailing-dot variant of the independents pseudo-party" },
  "J&KNC": { partyId: "jammu-kashmir-national-conference", disposition: "resolve", reason: "abbreviation variant of the existing row (NC)" },
  SS: { partyId: "shiv-sena", disposition: "resolve", reason: "RS abbreviation for Shiv Sena (archive abbrev SHS); human pairing" },
  SP: { partyId: "samajwadi-party", disposition: "resolve", reason: "RS SP rows span 1992-2022, entirely inside the Samajwadi era per the elections windows" },
  JAN: { partyId: null, disposition: "create", reason: "Bharatiya Jana Sangh; the D3-created bjs row is absent from this rebuilt sandbox - emit a merge candidate at insert instead of resolving blind" },
  O: { partyId: null, disposition: "create", reason: "NOT a party: an opaque party-not-recorded marker (76 rows, 1952-2000, many states). PROPOSAL IS ACTUALLY: leave unresolved, party_id null, label verbatim - the create here is a placeholder the gate must replace; see the spec" },
};

async function main() {
  const { db } = await import("../../src/lib/db");
  const { parties } = await import("../../src/lib/db/schema");
  const { parseCsv } = await import("../../src/lib/csv");
  const known: KnownParty[] = await db
    .select({ id: parties.id, name: parties.name, abbreviation: parties.abbreviation, isPseudo: parties.isPseudo })
    .from(parties);
  const rows = parseCsv(readFileSync("data/raw/tcpd-rs/data/TCPD_RSD_1.30_1952_20-07-2022_release.csv", "utf8"));
  const labels = new Set<string>();
  for (const r of rows) {
    const p = parseRsRow(r);
    if (!("refused" in p) && (p as RsRow).partyLabel && (p as RsRow).partyLabel !== "NOM.") labels.add((p as RsRow).partyLabel);
  }
  const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ["label,from_year,to_year,disposition,party_id,reason"];
  for (const l of [...labels].sort()) {
    const hand = HAND[l];
    if (hand) {
      lines.push([q(l), "", "", hand.disposition, hand.partyId ?? "", q(hand.reason)].join(","));
      continue;
    }
    const m = matchKnownParty(known, l, l);
    if (m.kind === "one") lines.push([q(l), "", "", "resolve", m.party.id, ""].join(","));
    else if (m.kind === "many") lines.push([q(l), "", "", "create", "", q(`matcher found MANY (${m.parties.map((p) => p.id).join(", ")}); gate pairs`)].join(","));
    else lines.push([q(l), "", "", "create", "", ""].join(","));
  }
  writeFileSync("data/raw/tcpd-rs/PARTY_RESOLUTIONS.csv", lines.join("\n") + "\n");
  console.log(lines.length - 1, "disposition proposals;",
    lines.filter((x) => x.includes(",resolve,")).length, "resolve;",
    lines.filter((x) => x.includes(",create,")).length, "create");
  process.exit(0);
}
main();
