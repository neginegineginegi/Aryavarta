import Link from "next/link";

/**
 * The ledger (public corrections feed) + how a correction lands (3 steps).
 * Server component. LATEST is placeholder data shaped like the real thing —
 * replace with a query for the 5 most recent revisions from src/lib/revisions
 * (keep the markup; map reviewed -> .ok, pending -> .pending).
 */

const LATEST = [
  { entry: "KERALA / CM / 1957", note: "Source upgraded to the ECI statistical report", status: "✓ REVIEWED", pending: false, when: "2H AGO" },
  { entry: "MANIPUR / PR / 2001", note: "End date corrected against the gazette notification", status: "✓ REVIEWED", pending: false, when: "6H AGO" },
  { entry: "LOK SABHA / 1977", note: "Turnout figure added, ECI report cited", status: "✓ REVIEWED", pending: false, when: "YESTERDAY" },
  { entry: "GOA / CM / 1990", note: "Caretaker period split into two entries", status: "✓ REVIEWED", pending: false, when: "YESTERDAY" },
  { entry: "UTTARAKHAND / 2000", note: "Edit #48,201 — formation date source swap", status: "● IN REVIEW", pending: true, when: "2D AGO" },
];

const STEPS = [
  { t: "Submit with a source", d: "Propose the change and paste the published source it comes from. A name is all that's asked." },
  { t: "A named moderator reviews", d: "The claim is checked against the source. What can't be verified is returned, not published." },
  { t: "It joins the record", d: "The entry updates with your name on it, and the previous version stays in the public history." },
];

export function LedgerSection() {
  return (
    <section className="lsec">
      <div className="lwrap ledger-grid">
        <div>
          <span className="lbadge">THE LEDGER</span>
          <h2 className="lh2">Corrections,<br />made in public.</h2>
          <p className="lsub" style={{ marginBottom: 22 }}>
            Every change carries its author, its source, and its reviewer. The feed below is
            how the archive looks after 48,000 edits.
          </p>
          <div>
            {LATEST.map((l) => (
              <div key={l.entry} className="ledger-row">
                <div className="ledger-top">
                  <span>{l.entry}</span>
                  <span className={l.pending ? "pending" : "ok"}>{l.status}</span>
                </div>
                <div className="ledger-sub">
                  <span className="ledger-note">{l.note}</span>
                  <span className="ledger-when">{l.when}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span className="lbadge">CONTRIBUTE</span>
          <h2 className="lh2">How a correction<br />lands.</h2>
          <p className="lsub" style={{ marginBottom: 10 }}>No account, no edit wars. One path from claim to record.</p>
          {STEPS.map((s, i) => (
            <div key={s.t} className="step">
              <div className="step-num">{String(i + 1).padStart(2, "0")}</div>
              <div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </div>
          ))}
          <Link href="/contribute" className="lbtn" style={{ marginTop: 20 }}>Submit a correction</Link>
        </div>
      </div>
    </section>
  );
}
