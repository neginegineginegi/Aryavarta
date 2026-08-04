/**
 * Wikidata client for the reference-data import pipeline (design rule #7):
 * Wikidata is NEVER the source of truth — it pre-fills structured drafts that
 * moderators verify against authoritative sources (ECI statistical reports)
 * before anything publishes.
 *
 * Discovery is search-based (wbsearchentities + Special:EntityData) rather
 * than SPARQL-class-based: Indian election item labels follow the stable
 * pattern "<year> <State> Legislative Assembly election", which is far more
 * robust than relying on a fragile instance-of class hierarchy.
 *
 * Everything degrades to null when a claim is absent; the admin preview UI
 * shows exactly what was found before any draft is created.
 *
 * IMPORT_FIXTURES=1 serves recorded fixtures instead of the network — used
 * for tests and for development in sandboxes without internet access.
 */

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const ENTITY_DATA = "https://www.wikidata.org/wiki/Special:EntityData";
const USER_AGENT = "AbhilekhImportBot/1.0 (https://abhilekh-orpin.vercel.app; reference-data pre-fill)";

// Wikidata property ids used below:
// P6    head of government (on a state item → CM statements)
// P102  member of political party
// P580  start time (qualifier)   P582 end time (qualifier)
// P585  point in time            P1128? (unused)
// P710  participant              P1410 number of seats (qualifier)
// P1342 number of seats (on the election item)
// P991  successful candidate

type WdTime = { time: string; precision: number };
type WdSnak = {
  datavalue?: {
    value: string | number | WdTime | { id?: string; "entity-type"?: string } | { amount?: string };
    type: string;
  };
};
type WdStatement = {
  mainsnak: WdSnak;
  qualifiers?: Record<string, WdSnak[]>;
};
type WdEntity = {
  id: string;
  labels?: Record<string, { value: string }>;
  claims?: Record<string, WdStatement[]>;
  sitelinks?: Record<string, { title: string }>;
};

export type ImportedTerm = {
  personQid: string | null;
  personLabel: string;
  partyQid: string | null;
  partyLabel: string | null;
  startDate: string | null; // ISO date
  startPrecision: "day" | "month" | "year" | null;
  endDate: string | null;
  endPrecision: "day" | "month" | "year" | null;
};

export type ImportedElectionResult = {
  partyQid: string | null;
  partyLabel: string;
  seatsWon: number | null;
};

export type ImportedElection = {
  qid: string;
  label: string;
  electionDate: string | null;
  datePrecision: "day" | "month" | "year" | null;
  totalSeats: number | null;
  results: ImportedElectionResult[];
  wikipediaUrl: string | null;
};

export type StateResolution = {
  qid: string;
  label: string;
  description: string | null;
};

async function wdFetch(url: string): Promise<unknown> {
  if (process.env.IMPORT_FIXTURES === "1") {
    return fixtureFor(url);
  }
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    // Reference lookups; no need to cache across requests.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Wikidata request failed (${res.status}) for ${url.slice(0, 120)}`);
  }
  return res.json();
}

export async function searchEntities(query: string, limit = 10): Promise<StateResolution[]> {
  const url = `${WIKIDATA_API}?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=${limit}&search=${encodeURIComponent(query)}&origin=*`;
  const data = (await wdFetch(url)) as {
    search?: Array<{ id: string; label?: string; description?: string }>;
  };
  return (data.search ?? []).map((s) => ({
    qid: s.id,
    label: s.label ?? s.id,
    description: s.description ?? null,
  }));
}

export async function getEntity(qid: string): Promise<WdEntity | null> {
  const url = `${ENTITY_DATA}/${qid}.json`;
  const data = (await wdFetch(url)) as { entities?: Record<string, WdEntity> };
  return data.entities?.[qid] ?? null;
}

// ---------------------------------------------------------------------------
// Claim helpers
// ---------------------------------------------------------------------------

function itemIdOf(snak: WdSnak | undefined): string | null {
  const v = snak?.datavalue?.value;
  if (v && typeof v === "object" && "id" in v && typeof v.id === "string") return v.id;
  return null;
}

function quantityOf(snak: WdSnak | undefined): number | null {
  const v = snak?.datavalue?.value;
  if (v && typeof v === "object" && "amount" in v && v.amount != null) {
    const n = Number(v.amount);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

export function timeOf(
  snak: WdSnak | undefined,
): { date: string; precision: "day" | "month" | "year" } | null {
  const v = snak?.datavalue?.value;
  if (!v || typeof v !== "object" || !("time" in v)) return null;
  const t = v as WdTime;
  // Wikidata time format: +2018-12-11T00:00:00Z ; precision 11=day 10=month 9=year
  const m = /^\+?(\d{4})-(\d{2})-(\d{2})/.exec(t.time);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (t.precision >= 11) return { date: `${y}-${mo}-${d}`, precision: "day" };
  if (t.precision === 10) return { date: `${y}-${mo === "00" ? "01" : mo}-01`, precision: "month" };
  return { date: `${y}-01-01`, precision: "year" };
}

function labelOf(entity: WdEntity | null): string | null {
  return entity?.labels?.en?.value ?? null;
}

// ---------------------------------------------------------------------------
// High-level fetchers
// ---------------------------------------------------------------------------

/** Resolve a state name to its Wikidata item, preferring Indian-state matches. */
export async function resolveState(stateName: string): Promise<StateResolution[]> {
  const results = await searchEntities(stateName, 8);
  const rank = (r: StateResolution) => {
    const d = (r.description ?? "").toLowerCase();
    if (d.includes("state of india") || d.includes("union territory")) return 0;
    if (d.includes("india")) return 1;
    return 2;
  };
  return results.sort((a, b) => rank(a) - rank(b));
}

/**
 * Office-holder history from statements on an entity:
 * P6 (head of government) = CM on a state item, PM on India's item;
 * P35 (head of state) = President on India's item.
 */
export async function fetchHeadTerms(
  entityQid: string,
  property: "P6" | "P35",
): Promise<ImportedTerm[]> {
  const state = await getEntity(entityQid);
  const statements = state?.claims?.[property] ?? [];
  const terms: ImportedTerm[] = [];

  // Batch-load person entities for labels + party.
  const personQids = [...new Set(statements.map((s) => itemIdOf(s.mainsnak)).filter(Boolean))] as string[];
  const people = new Map<string, WdEntity | null>();
  for (const qid of personQids) {
    people.set(qid, await getEntity(qid));
  }

  const partyQids = new Set<string>();
  for (const p of people.values()) {
    const party = itemIdOf(p?.claims?.P102?.[0]?.mainsnak);
    if (party) partyQids.add(party);
  }
  const parties = new Map<string, WdEntity | null>();
  for (const qid of partyQids) {
    parties.set(qid, await getEntity(qid));
  }

  for (const st of statements) {
    const personQid = itemIdOf(st.mainsnak);
    const person = personQid ? (people.get(personQid) ?? null) : null;
    const partyQid = itemIdOf(person?.claims?.P102?.[0]?.mainsnak);
    const party = partyQid ? (parties.get(partyQid) ?? null) : null;
    const start = timeOf(st.qualifiers?.P580?.[0]);
    const end = timeOf(st.qualifiers?.P582?.[0]);
    terms.push({
      personQid,
      personLabel: labelOf(person) ?? personQid ?? "Unknown",
      partyQid,
      partyLabel: labelOf(party),
      startDate: start?.date ?? null,
      startPrecision: start?.precision ?? null,
      endDate: end?.date ?? null,
      endPrecision: end?.precision ?? null,
    });
  }

  terms.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  return terms;
}

/**
 * Elections discovered by their stable label patterns:
 * assembly — "<State> Legislative Assembly election"
 * general  — "Indian general election" (Lok Sabha)
 */
export async function fetchElections(
  stateName: string,
  pattern: "assembly" | "general" = "assembly",
): Promise<ImportedElection[]> {
  const query =
    pattern === "general"
      ? "Indian general election"
      : `${stateName} Legislative Assembly election`;
  const matcher =
    pattern === "general" ? /indian general election/i : /legislative assembly election/i;
  const candidates = await searchEntities(query, 50);
  const electionLike = candidates.filter((c) => matcher.test(c.label));

  const elections: ImportedElection[] = [];
  for (const cand of electionLike) {
    const entity = await getEntity(cand.qid);
    if (!entity) continue;
    const when = timeOf(entity.claims?.P585?.[0]?.mainsnak) ?? timeOf(entity.claims?.P580?.[0]?.mainsnak);
    const totalSeats = quantityOf(entity.claims?.P1342?.[0]?.mainsnak);

    const results: ImportedElectionResult[] = [];
    for (const part of entity.claims?.P710 ?? []) {
      const partyQid = itemIdOf(part.mainsnak);
      if (!partyQid) continue;
      const partyEntity = await getEntity(partyQid);
      const seats = quantityOf(part.qualifiers?.P1410?.[0]);
      results.push({
        partyQid,
        partyLabel: labelOf(partyEntity) ?? partyQid,
        seatsWon: seats,
      });
    }

    const enTitle = entity.sitelinks?.enwiki?.title;
    elections.push({
      qid: cand.qid,
      label: labelOf(entity) ?? cand.label,
      electionDate: when?.date ?? null,
      datePrecision: when?.precision ?? null,
      totalSeats,
      results: results.sort((a, b) => (b.seatsWon ?? -1) - (a.seatsWon ?? -1)),
      wikipediaUrl: enTitle
        ? `https://en.wikipedia.org/wiki/${encodeURIComponent(enTitle.replace(/ /g, "_"))}`
        : null,
    });
  }

  elections.sort((a, b) => (a.electionDate ?? "").localeCompare(b.electionDate ?? ""));
  return elections;
}

export function wikidataItemUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
}

// ---------------------------------------------------------------------------
// Fixtures (IMPORT_FIXTURES=1): a tiny, clearly-labelled sample used for
// tests and offline development. NOT real reference data.
// ---------------------------------------------------------------------------

function fixtureFor(url: string): unknown {
  const fixtures = getFixtures();
  if (url.includes("wbsearchentities")) {
    const q = decodeURIComponent(/search=([^&]+)/.exec(url)?.[1] ?? "");
    if (/election/i.test(q)) return fixtures.electionSearch;
    return fixtures.stateSearch;
  }
  const qid = /EntityData\/(Q\d+)\.json/.exec(url)?.[1];
  if (qid && fixtures.entities[qid]) return { entities: { [qid]: fixtures.entities[qid] } };
  return { entities: {} };
}

function t(time: string, precision: number) {
  return { datavalue: { value: { time, precision }, type: "time" } };
}
function item(id: string) {
  return { datavalue: { value: { id, "entity-type": "item" }, type: "wikibase-entityid" } };
}
function qty(amount: number) {
  return { datavalue: { value: { amount: String(amount) }, type: "quantity" } };
}

function getFixtures() {
  const entities: Record<string, unknown> = {
    Q900001: {
      id: "Q900001",
      labels: { en: { value: "Fixture State" } },
      claims: {
        P6: [
          {
            mainsnak: item("Q900101"),
            qualifiers: { P580: [t("+2018-12-17T00:00:00Z", 11)], P582: [t("+2023-12-03T00:00:00Z", 11)] },
          },
          {
            mainsnak: item("Q900102"),
            qualifiers: { P580: [t("+2023-12-15T00:00:00Z", 11)] },
          },
        ],
      },
    },
    Q900101: {
      id: "Q900101",
      labels: { en: { value: "Fixture Person Alpha" } },
      claims: { P102: [{ mainsnak: item("Q900201") }] },
    },
    Q900102: {
      id: "Q900102",
      labels: { en: { value: "Fixture Person Beta" } },
      claims: { P102: [{ mainsnak: item("Q900202") }] },
    },
    Q900201: { id: "Q900201", labels: { en: { value: "Fixture National Party" } }, claims: {} },
    Q900202: { id: "Q900202", labels: { en: { value: "Fixture Regional Party" } }, claims: {} },
    Q900301: {
      id: "Q900301",
      labels: { en: { value: "2018 Fixture State Legislative Assembly election" } },
      sitelinks: { enwiki: { title: "2018 Fixture State Legislative Assembly election" } },
      claims: {
        P585: [{ mainsnak: t("+2018-12-07T00:00:00Z", 11) }],
        P1342: [{ mainsnak: qty(200) }],
        P710: [
          { mainsnak: item("Q900201"), qualifiers: { P1410: [qty(108)] } },
          { mainsnak: item("Q900202"), qualifiers: { P1410: [qty(73)] } },
        ],
      },
    },
    Q900302: {
      id: "Q900302",
      labels: { en: { value: "2023 Fixture State Legislative Assembly election" } },
      sitelinks: { enwiki: { title: "2023 Fixture State Legislative Assembly election" } },
      claims: {
        P585: [{ mainsnak: t("+2023-11-25T00:00:00Z", 11) }],
        P1342: [{ mainsnak: qty(200) }],
        P710: [
          { mainsnak: item("Q900202"), qualifiers: { P1410: [qty(115)] } },
          { mainsnak: item("Q900201"), qualifiers: { P1410: [qty(69)] } },
        ],
      },
    },
  };
  return {
    stateSearch: {
      search: [
        { id: "Q900001", label: "Fixture State", description: "state of India (fixture)" },
      ],
    },
    electionSearch: {
      search: [
        {
          id: "Q900301",
          label: "2018 Fixture State Legislative Assembly election",
          description: "fixture election",
        },
        {
          id: "Q900302",
          label: "2023 Fixture State Legislative Assembly election",
          description: "fixture election",
        },
      ],
    },
    entities,
  };
}
