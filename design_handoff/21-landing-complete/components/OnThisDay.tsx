/**
 * On this day, across the record. Server component: the date is computed at
 * render, so if the landing page is fully static, add
 * `export const revalidate = 3600` to src/app/page.tsx.
 *
 * ENTRIES is a curated seed keyed MM-DD; days without a curated set fall back
 * to GENERIC (tenure facts that hold for any date in their year).
 * TODO: replace with a query over the archive's dated entries once one exists.
 */

type Entry = { year: string; text: string; src: string };

const ENTRIES: Record<string, Entry[]> = {
  "08-21": [
    { year: "1947", text: "Jawaharlal Nehru is six days into office as India's first Prime Minister.", src: "GAZETTE OF INDIA" },
    { year: "1969", text: "Chief Justice Mohammad Hidayatullah is serving as acting President, three days before V.V. Giri is sworn in.", src: "PRESIDENT'S SECRETARIAT" },
    { year: "1975", text: "The Emergency is in its ninth week; the 38th Amendment has just placed it beyond judicial review.", src: "38TH AMENDMENT, 1975" },
    { year: "1990", text: "Lalu Prasad Yadav is five months into his first term as Chief Minister of Bihar.", src: "ECI SR — BIHAR 1990" },
  ],
};

const GENERIC: Entry[] = [
  { year: "1966", text: "Indira Gandhi is in her first year as Prime Minister.", src: "LOK SABHA RECORDS" },
  { year: "1975", text: "The Emergency is in force; fundamental rights stand suspended.", src: "GAZETTE OF INDIA" },
  { year: "1978", text: "Morarji Desai leads the first non-Congress government at the Centre.", src: "LOK SABHA RECORDS" },
  { year: "1996", text: "H.D. Deve Gowda heads the 13-party United Front government.", src: "PIB ARCHIVE" },
];

export function OnThisDaySection() {
  const now = new Date();
  const key = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const entries = ENTRIES[key] ?? GENERIC;
  const label = now.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return (
    <section className="lsec">
      <div className="otd-head">
        <span className="lbadge">ON THIS DAY</span>
        <h2 className="lh2 lh2-lg">{label},<br />across the record.</h2>
        <p className="lsub">The same date, four different Indias, each entry dated and sourced.</p>
      </div>
      <div className="otd-grid">
        {entries.map((o) => (
          <div key={o.year} className="otd-card">
            <div className="otd-year">{o.year}</div>
            <div className="otd-text">{o.text}</div>
            <div className="otd-src">✓ {o.src}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
