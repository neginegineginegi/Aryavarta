/**
 * The decisions scripts/go.ts makes, as pure functions, so they can be
 * tested without a database, a terminal or a Vercel account.
 *
 * go.ts is the runbook's steps 0a → 2 → 3 → 4 as one guided command. The
 * gates themselves live in scripts/stage2-common.ts and inside the two insert
 * scripts; nothing here replaces or re-implements one. What lives here is the
 * glue the command adds around them: which dataset slugs mean "already run",
 * what to tell a user whose .env has no credential, how to print the before
 * and after, and which pages to open to see each change.
 */

/** A dataset slug with one of these prefixes means a stage-2 front already
 *  ran into this database. go.ts is for a first run of both fronts; a redo
 *  goes through the runbook's revert first. */
export const ALREADY_INGESTED_PREFIXES = ["tcpd-", "eci-electoral-bonds-"] as const;

export function alreadyIngested(slugs: readonly string[]): string[] {
  return slugs.filter((s) => ALREADY_INGESTED_PREFIXES.some((p) => s.startsWith(p)));
}

/** The host of a connection URL, which is the one part of it a person can
 *  type back without disclosing a credential. Null when the URL does not
 *  parse. */
export function hostOf(url: string): string | null {
  try {
    const h = new URL(url).hostname;
    return h || null;
  } catch {
    return null;
  }
}

/**
 * Printed when .env carries no DATABASE_URL. The path is spelled out because
 * more than one Vercel project builds this repository and only one of them
 * owns the domain readers visit; copying the other project's URL produces an
 * insert that succeeds completely into a database nobody reads.
 */
export function missingDatabaseUrlMessage(why: string): string {
  return [
    `${why}.`,
    "",
    "Where to copy it from, exactly:",
    "  1. vercel.com → your team → open BOTH projects that build this repository.",
    "  2. For each, Settings → Domains: the project whose domain is the one readers",
    "     visit is the production project. The other one is not, whatever it is named.",
    "  3. In the production project: Settings → Environment Variables → DATABASE_URL",
    "     → Production → reveal → copy.",
    '  4. Paste it into this checkout\'s .env as   DATABASE_URL="<the value>"',
    '     and set   DATABASE_DRIVER="neon"   beside it.',
    "",
    "The value goes into the file and nowhere else — never into a chat, a commit, a",
    "terminal echo, or a screenshot. Then run this command again.",
  ].join("\n");
}

export type Counts = Record<string, number | null>;

/** The measures the two inserts move, in the order they are printed. */
export const COUNT_KEYS = [
  "orgs",
  "funding transactions",
  "graph nodes (orgs + people)",
  "graph edges (transactions + board + relationships)",
  "rs_members",
  "rs_terms",
] as const;

const show = (n: number | null | undefined): string => (n === null || n === undefined ? "table absent" : String(n));

/**
 * Before/after as a table. With `after` null (a dry run) the table carries
 * the before column and says the rest is measured by a real run — it never
 * prints a predicted number as if it were observed.
 */
export function countsTable(before: Counts, after: Counts | null): string[] {
  const lines = after
    ? ["| measure | before | after | change |", "|---|---|---|---|"]
    : ["| measure | now | after |", "|---|---|---|"];
  for (const k of Object.keys(before)) {
    const b = before[k];
    if (!after) {
      lines.push(`| ${k} | ${show(b)} | measured after the inserts in a real run |`);
      continue;
    }
    const a = after[k];
    const change =
      typeof b === "number" && typeof a === "number" ? (a - b >= 0 ? `+${a - b}` : String(a - b)) : "—";
    lines.push(`| ${k} | ${show(b)} | ${show(a)} | ${change} |`);
  }
  return lines;
}

/** NEXT_PUBLIC_SITE_URL from .env, if it is a usable absolute URL; else null
 *  and the pages are printed as paths. */
export function siteUrlFrom(env: Record<string, string | undefined>): string | null {
  const raw = (env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+$/.test(raw)) return null;
  if (/your-domain\.example|localhost|127\.0\.0\.1/.test(raw)) return null;
  return raw;
}

export type PageFacts = {
  seatSlug?: string | null;
  memberId?: string | null;
  purchaserSlug?: string | null;
};

/**
 * The pages to open after the inserts, each with what should have changed on
 * it. Pages that depend on a row the insert created (a seat, a member, a
 * purchaser) are listed only when the caller found one.
 */
export function pagesToOpen(siteUrl: string | null, facts: PageFacts): Array<{ url: string; why: string }> {
  const at = (path: string) => (siteUrl ? `${siteUrl}${path}` : path);
  const out: Array<{ url: string; why: string }> = [
    { url: at("/admin/import"), why: 'press "Refresh cached pages" FIRST — the landing map, state pages and Union page are tag-cached and a terminal insert bumps no tag' },
    { url: at("/rajya-sabha"), why: "member and seat counts, the coverage boundary; 1-hour cache, so load it twice after the hour or after the refresh" },
  ];
  if (facts.seatSlug) out.push({ url: at(`/rajya-sabha/${facts.seatSlug}`), why: "one seat's members as the publisher labelled them; rendered per request" });
  if (facts.memberId) out.push({ url: at(`/person/rs/${facts.memberId}`), why: "one member's terms, Type carrying its 2022-07-20 snapshot date; rendered per request" });
  out.push({ url: at("/network"), why: "the funding graph: nodes and edges should have risen by the counts above; rendered per request" });
  if (facts.purchaserSlug) out.push({ url: at(`/network/org/${facts.purchaserSlug}`), why: "the largest purchaser: each transaction's counterparty should be the linked party's name (the verbatim recipient_label is stored but rendered on no page)" });
  out.push({ url: at("/browse"), why: "the Rajya Sabha link appears once rs_members has rows; 5-minute cache" });
  return out;
}
