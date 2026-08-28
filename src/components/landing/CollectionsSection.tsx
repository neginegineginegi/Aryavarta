import Link from "next/link";

import { getCollectionCounts, type EraRange } from "@/lib/db/queries/landing";
import { formatNumber } from "@/lib/format";

/** Era boundaries are historical facts; the counts are queried from the
 *  archive at render time. The handoff's placeholder counts never ship. */
export const COLLECTIONS: Array<{
  years: string;
  range: EraRange;
  title: string;
  text: string;
  href: string;
}> = [
  { years: "1946 \u2014 1949", range: { from: 1946, to: 1949 }, title: "The Constituent Assembly", text: "The drafting of the Constitution, session by session.", href: "/browse" },
  { years: "1956", range: { from: 1956, to: 1956 }, title: "States Reorganisation", text: "How today's state boundaries were drawn along linguistic lines.", href: "/browse" },
  { years: "1975 \u2014 1977", range: { from: 1975, to: 1977 }, title: "The Emergency", text: "Suspended elections, press censorship, and the amendments that followed.", href: "/browse" },
  { years: "1989 \u2014 2014", range: { from: 1989, to: 2014 }, title: "The Coalition Era", text: "Two decades without a single-party majority in the Lok Sabha.", href: "/browse" },
];

export async function CollectionsSection() {
  const counts = await getCollectionCounts(COLLECTIONS.map((c) => c.range));
  return (
    <section className="l20 l20-tint" aria-labelledby="coll-h">
      <div className="l20-wrap">
        <div className="l20-head">
          <span className="l20-eyebrow">FEATURED COLLECTIONS</span>
          <h2 className="l20-h2" id="coll-h">
            Curated entry points<br />into the record.
          </h2>
        </div>
        <div className="coll-grid">
          {COLLECTIONS.map((c, i) => (
            <Link className="coll-card" href={c.href} key={c.title}>
              <div className="coll-years">{c.years}</div>
              <div className="coll-t">{c.title}</div>
              <div className="coll-p">{c.text}</div>
              {counts[i] > 0 ? (
                <div className="coll-n">
                  {formatNumber(counts[i])} {counts[i] === 1 ? "RECORD" : "RECORDS"} IN THE ARCHIVE
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
