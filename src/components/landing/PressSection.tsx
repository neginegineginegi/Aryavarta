import { getSourceKinds } from "@/lib/db/queries/landing";

/* Deliberately empty slots. Replace a card's quote/attribution only when real
   coverage exists; do not invent placeholder publications. */
export const PRESS_SLOTS = [
  { kind: "PRINT / DIGITAL", quote: "Pull quote goes here once a publication covers the archive." },
  { kind: "BROADCAST", quote: "Pull quote goes here once a broadcaster covers the archive." },
  { kind: "POLICY / ACADEMIC", quote: "Pull quote goes here once a journal or institution cites the archive." },
];



export function PressSection() {
  return (
    <section className="l20 l20-tint" aria-labelledby="press-h">
      <div className="l20-head">
        <span className="l20-eyebrow">PRESS &amp; MENTIONS</span>
        <h2 className="l20-h2" id="press-h">
          Coverage,<br />as it comes in.
        </h2>
        <p className="l20-lede">
          This section fills in as the archive gets written about. The slots below show the shape
          it&rsquo;ll take.
        </p>
      </div>
      <div className="press-grid">
        {PRESS_SLOTS.map((p) => (
          <div className="press-card" key={p.kind}>
            <div className="press-kind">{p.kind}</div>
            <div className="press-quote">{p.quote}</div>
            <div className="press-pending">&mdash; PENDING</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The strip names the KINDS of source the archive actually cites, straight
 *  from the sources table; the handoff's institution list never ships as a
 *  provenance claim. Renders nothing while the archive cites nothing. */
export async function SourcesStrip() {
  const kinds = await getSourceKinds();
  if (kinds.length === 0) return null;
  return (
    <section className="l20 src-strip" aria-labelledby="src-h">
      <div className="l20-wrap">
        <span className="l20-eyebrow" id="src-h">DRAWN FROM</span>
        <div className="src-row">
          {kinds.map((s) => (
            <span className="src-name" key={s}>{s}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
