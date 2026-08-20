/**
 * Reproduce the section 1 measurement in docs/NETWORK_AT_LOW_DENSITY.md.
 *
 * That document's conclusions rest entirely on one number: independent cycles.
 * If it has moved, the conclusions move with it, so the measurement has to be
 * repeatable by anyone rather than a figure quoted from a session that is now
 * gone. Run after every bulk ingest.
 *
 *   pnpm tsx scripts/dev/measure-network-density.ts
 *
 * Reads the inbox CSVs directly rather than the database, so it measures the
 * data as filed, without depending on what has been loaded or approved.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adjacency, bridges, components } from "../../src/lib/funding/analysis";
import { parseCsv } from "../../src/lib/csv";

const INBOX = resolve(process.cwd(), "data/inbox");

function rows(file: string): Record<string, string>[] {
  return parseCsv(readFileSync(resolve(INBOX, file), "utf8"));
}

const transactions = rows("funding_transactions.csv");
const board = rows("funding_board.csv");
const orgs = rows("funding_orgs.csv");
const people = rows("funding_people.csv");
const fcra = rows("funding_fcra.csv");

// Same key shape the graph uses: type-prefixed, so a person and an org that
// happen to share a name are two nodes rather than one.
const edges: Array<{ from: string; to: string }> = [];
const nodeKeys = new Set<string>();

const add = (from: string, to: string) => {
  if (!from || !to) return;
  nodeKeys.add(from);
  nodeKeys.add(to);
  edges.push({ from, to });
};

for (const t of transactions) add(`org:${t.donor}`, `org:${t.recipient}`);
for (const b of board) add(`person:${b.person}`, `org:${b.org}`);

const adj = adjacency([...nodeKeys], edges);
const comps = components(adj);

// Parallel edges collapse in an undirected adjacency, and the cycle count has
// to be taken on the graph as drawn, not on the row count, or two grants
// between the same pair would read as a cycle that is not there.
const distinct = new Set(edges.map((e) => [e.from, e.to].sort().join("")));
const n = nodeKeys.size;
const m = distinct.size;
const c = comps.length;
const cycles = m - n + c;

const degrees = [...adj.entries()].map(([, s]) => s.size);
const leaves = degrees.filter((d) => d === 1).length;
const cuts = bridges(adj).length;
const pct = (x: number) => `${Math.round((x / n) * 100)}%`;

console.log("Source rows");
console.log(`  organisations           ${orgs.length}`);
console.log(`  people                  ${people.length}`);
console.log(`  funding transactions    ${transactions.length}`);
console.log(`  board positions         ${board.length}`);
console.log(`  FCRA registrations      ${fcra.length}`);
console.log("");
console.log("Graph (transactions + board, undirected)");
console.log(`  nodes                   ${n}`);
console.log(`  edges (distinct pairs)  ${m}   [${edges.length} relation rows]`);
console.log(`  components              ${c}`);
console.log(`  mean degree             ${(degrees.reduce((a, b) => a + b, 0) / n).toFixed(2)}`);
console.log(`  nodes at degree 1       ${leaves}, or ${pct(leaves)}`);
console.log(`  independent cycles      ${cycles}`);
console.log(`  articulation points     ${cuts}, or ${pct(cuts)}`);
console.log("");
console.log(
  cycles < 10
    ? `A forest plus ${cycles} extra edge${cycles === 1 ? "" : "s"}. The low-density reading in\n` +
        "docs/NETWORK_AT_LOW_DENSITY.md still holds."
    : `Independent cycles have reached ${cycles}. Section 6 of\n` +
        "docs/NETWORK_AT_LOW_DENSITY.md says to revisit the document, starting with\n" +
        "the structure panel's threshold.",
);
