export const AUDIENCES = [
  { glyph: "\u25c8", title: "Researchers", text: "Cross-reference officeholders, elections and events without re-deriving them from primary sources each time." },
  { glyph: "\u270e", title: "Journalists", text: "Verify who held office when, on deadline, with a citation ready to publish." },
  { glyph: "\u25a4", title: "Students", text: "See a period of Indian political history laid out year by year, with sources attached." },
  { glyph: "\u25ce", title: "Genealogists & local historians", text: "Trace who governed a state or district across the years a family or place was there." },
];

export default function AudienceSection() {
  return (
    <section className="l20" aria-labelledby="aud-h">
      <div className="l20-head">
        <span className="l20-eyebrow">WHO IT&rsquo;S FOR</span>
        <h2 className="l20-h2" id="aud-h">
          One record,<br />read differently by everyone.
        </h2>
      </div>
      <div className="aud-grid">
        {AUDIENCES.map((a) => (
          <div className="aud-card" key={a.title}>
            <div className="aud-glyph" aria-hidden="true">{a.glyph}</div>
            <div className="aud-t">{a.title}</div>
            <div className="aud-p">{a.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
