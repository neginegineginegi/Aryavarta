"use client";

import { useState } from "react";

/**
 * Seventy-nine years as one proportional strip: segment width = years in
 * office. Hover or keyboard-focus a segment to read the era below the strip.
 * Buttons, not divs, so the strip is keyboard-traversable.
 */

const ERAS = [
  { tag: "NEHRU", name: "Jawaharlal Nehru", years: "1947 — 1964", dur: "17 years", g: 17 },
  { tag: "", name: "Lal Bahadur Shastri, with Gulzarilal Nanda acting", years: "1964 — 1966", dur: "19 months", g: 2 },
  { tag: "INDIRA", name: "Indira Gandhi", years: "1966 — 1977", dur: "11 years", g: 11 },
  { tag: "", name: "Morarji Desai & Charan Singh — the Janata years", years: "1977 — 1980", dur: "2½ years", g: 3 },
  { tag: "INDIRA II", name: "Indira Gandhi", years: "1980 — 1984", dur: "4 years", g: 4.9 },
  { tag: "RAJIV", name: "Rajiv Gandhi", years: "1984 — 1989", dur: "5 years", g: 5.1 },
  { tag: "", name: "V.P. Singh & Chandra Shekhar", years: "1989 — 1991", dur: "18 months", g: 1.6 },
  { tag: "RAO", name: "P.V. Narasimha Rao", years: "1991 — 1996", dur: "5 years", g: 4.9 },
  { tag: "", name: "Vajpayee (13 days), Deve Gowda & Gujral", years: "1996 — 1998", dur: "22 months", g: 1.9 },
  { tag: "VAJPAYEE", name: "Atal Bihari Vajpayee", years: "1998 — 2004", dur: "6 years", g: 6.1 },
  { tag: "MANMOHAN", name: "Manmohan Singh", years: "2004 — 2014", dur: "10 years", g: 10 },
  { tag: "MODI", name: "Narendra Modi", years: "2014 — TODAY", dur: "in office", g: 12.3 },
];

export function TimelineSection() {
  const [i, setI] = useState(ERAS.length - 1);
  const cur = ERAS[i];
  return (
    <section className="lsec">
      <div className="lwrap">
        <div className="pm-head">
          <div>
            <span className="lbadge">THE TIMELINE</span>
            <h2 className="lh2">Seventy-nine years,<br />one strip.</h2>
          </div>
          <div className="pm-meta">14 PRIME MINISTERS<br />WIDTH = YEARS IN OFFICE</div>
        </div>
        <div className="pm-strip" role="list" aria-label="Prime ministerial eras, 1947 to today">
          {ERAS.map((e, k) => (
            <button
              key={e.years}
              type="button"
              role="listitem"
              className={`pm-seg${k === i ? " on" : ""}`}
              style={{ flexGrow: e.g }}
              onMouseEnter={() => setI(k)}
              onFocus={() => setI(k)}
              aria-label={`${e.name}, ${e.years.replace("—", "to")}`}
            >
              <span aria-hidden>{e.tag}</span>
            </button>
          ))}
        </div>
        <div className="pm-ticks" aria-hidden><span>1947</span><span>2026</span></div>
        <p className="pm-detail" aria-live="polite">
          <span className="yr">{cur.years}</span>{cur.name} · {cur.dur}
        </p>
      </div>
    </section>
  );
}
