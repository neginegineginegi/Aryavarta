export const COLLECTIONS = [
  { years: "1946 \u2014 1949", title: "The Constituent Assembly", text: "The drafting of the Constitution, session by session.", count: "310", href: "/browse" },
  { years: "1956", title: "States Reorganisation", text: "How today's state boundaries were drawn along linguistic lines.", count: "180", href: "/browse" },
  { years: "1975 \u2014 1977", title: "The Emergency", text: "Suspended elections, press censorship, and the amendments that followed.", count: "240", href: "/browse" },
  { years: "1989 \u2014 2014", title: "The Coalition Era", text: "Two decades without a single-party majority in the Lok Sabha.", count: "410", href: "/browse" },
];

export function CollectionsSection() {
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
          {COLLECTIONS.map((c) => (
            <a className="coll-card" href={c.href} key={c.title}>
              <div className="coll-years">{c.years}</div>
              <div className="coll-t">{c.title}</div>
              <div className="coll-p">{c.text}</div>
              <div className="coll-n">{c.count} ENTRIES</div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
