import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { personSlug } from "@/lib/db/queries/person";

/**
 * Every public URL the archive holds, for src/app/sitemap.ts.
 *
 * Two rules run through all of it.
 *
 * A page is listed only if a reader who follows the link finds a record. The
 * archive covers 1947 to now for 39 states, but a state-year with nothing
 * recorded in it is a page that says so, and a thousand of those in a sitemap
 * spend crawl budget on the archive's gaps instead of its contents. So the
 * year pages are generated from what is recorded, not from the calendar.
 *
 * `lastModified` is emitted only where a real timestamp exists to source it
 * from, and omitted everywhere else. It is optional in the sitemap spec, and
 * the alternative on offer is `new Date()` at build time, which would tell
 * every crawler that every page changed on every deploy. That is false, and a
 * sitemap that lies about freshness is worse than one that stays quiet about
 * it: the crawler learns to discount the field.
 */

export type SitemapEntry = { path: string; lastModified?: Date };

/** The union is a pseudo-state: /state/in and /state/in/[year] both redirect. */
const UNION_STATE = "in";
const MIN_YEAR = 1947;

export async function sitemapEntries(): Promise<SitemapEntry[]> {
  const maxYear = new Date().getFullYear();

  const [
    stateRows,
    stateTouched,
    stateYearRows,
    electionRows,
    eventRows,
    personRows,
    partyRows,
    indicatorRows,
    orgRows,
    fundingPeopleRows,
  ] = await Promise.all([
    db.execute(sql`SELECT id FROM states WHERE id <> ${UNION_STATE} ORDER BY id`),

    // A state's changelog is the honest source for when its record last moved.
    // revisions.state_id is text and carries the state code directly, which is
    // what makes this joinable at all: revisions.entity_id is a uuid and state
    // ids are codes like 'dndd'.
    db.execute(sql`
      SELECT state_id, max(created_at) AS touched
        FROM revisions
       WHERE status = 'approved'
       GROUP BY state_id
    `),

    // A state-year exists when the archive records a term running through it
    // OR an event dated in it. Elections need no separate branch: every
    // recorded election falls inside a term year for its state.
    db.execute(sql`
      SELECT DISTINCT state_id, y
        FROM (
          SELECT t.state_id,
                 generate_series(
                   GREATEST(EXTRACT(YEAR FROM t.start_date)::int, ${MIN_YEAR}),
                   LEAST(COALESCE(EXTRACT(YEAR FROM t.end_date)::int, ${maxYear}), ${maxYear})
                 ) AS y
            FROM terms t
           WHERE t.deleted_at IS NULL
          UNION
          SELECT e.state_id, e.year
            FROM events e
           WHERE e.deleted_at IS NULL
             AND e.status IN ('published', 'disputed')
             AND e.year BETWEEN ${MIN_YEAR} AND ${maxYear}
        ) x
       WHERE state_id <> ${UNION_STATE}
       ORDER BY state_id, y
    `),

    db.execute(sql`
      SELECT id, updated_at FROM elections WHERE deleted_at IS NULL ORDER BY id
    `),

    // Only the two statuses the event page actually renders. The rest 404, and
    // a sitemap entry for a 404 is a crawl error the archive asked for.
    db.execute(sql`
      SELECT id, updated_at
        FROM events
       WHERE deleted_at IS NULL AND status IN ('published', 'disputed')
       ORDER BY id
    `),

    // Person pages are keyed by a slug of the recorded name, across every
    // office: chief ministers, governors, prime ministers and presidents.
    db.execute(sql`
      SELECT DISTINCT cm_name
        FROM terms
       WHERE cm_name IS NOT NULL AND btrim(cm_name) <> '' AND deleted_at IS NULL
       ORDER BY cm_name
    `),

    db.execute(sql`SELECT id FROM parties ORDER BY id`),
    db.execute(sql`SELECT id FROM indicators ORDER BY id`),
    db.execute(sql`SELECT slug FROM orgs WHERE slug IS NOT NULL ORDER BY slug`),
    db.execute(sql`SELECT slug FROM people WHERE slug IS NOT NULL ORDER BY slug`),
  ]);

  const touched = new Map<string, Date>();
  for (const r of stateTouched.rows as Array<{ state_id: string; touched: string | Date | null }>) {
    if (r.touched) touched.set(r.state_id, new Date(r.touched));
  }

  const out: SitemapEntry[] = [
    // The standing surfaces. No lastModified: each one recomposes from the
    // whole archive on every request, so there is no single date to give.
    { path: "/" },
    { path: "/union" },
    { path: "/browse" },
    { path: "/insights" },
    { path: "/compare" },
    { path: "/network" },
    { path: "/network/connect" },
    { path: "/archive" },
    { path: "/search" },
    { path: "/about" },
    { path: "/methodology" },
  ];

  for (const r of stateRows.rows as Array<{ id: string }>) {
    out.push({ path: `/state/${r.id}`, lastModified: touched.get(r.id) });
  }

  for (const r of stateYearRows.rows as Array<{ state_id: string; y: number }>) {
    out.push({
      path: `/state/${r.state_id}/${r.y}`,
      // A year page's content is a slice of its state's record, so it moves
      // when the state's record moves.
      lastModified: touched.get(r.state_id),
    });
  }

  for (let y = MIN_YEAR; y <= maxYear; y++) out.push({ path: `/union/${y}` });

  for (const r of electionRows.rows as Array<{ id: string; updated_at: string | Date | null }>) {
    out.push({
      path: `/election/${r.id}`,
      lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
    });
  }

  for (const r of eventRows.rows as Array<{ id: string; updated_at: string | Date | null }>) {
    out.push({
      path: `/event/${r.id}`,
      lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
    });
  }

  // No timestamp exists for any of the four below, so none is claimed.
  const seenPeople = new Set<string>();
  for (const r of personRows.rows as Array<{ cm_name: string }>) {
    const slug = personSlug(r.cm_name);
    // Two politicians with the same recorded name share a page, by design and
    // documented in queries/person.ts. One URL, listed once.
    if (seenPeople.has(slug)) continue;
    seenPeople.add(slug);
    out.push({ path: `/person/${slug}` });
  }

  for (const r of partyRows.rows as Array<{ id: string }>) out.push({ path: `/party/${r.id}` });
  for (const r of indicatorRows.rows as Array<{ id: string }>)
    out.push({ path: `/indicator/${r.id}` });
  for (const r of orgRows.rows as Array<{ slug: string }>)
    out.push({ path: `/network/org/${r.slug}` });
  for (const r of fundingPeopleRows.rows as Array<{ slug: string }>)
    out.push({ path: `/network/person/${r.slug}` });

  return out;
}
