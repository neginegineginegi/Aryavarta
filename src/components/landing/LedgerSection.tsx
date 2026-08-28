import Link from "next/link";

import { getLedgerFeed } from "@/lib/db/queries/landing";
import { formatNumber } from "@/lib/format";

/**
 * The ledger (public corrections feed) + how a correction lands (3 steps).
 * Server component reading the five most recent public revisions and the
 * all-time edit count from the revisions table, per the handoff's own note
 * that its placeholder feed must not ship.
 */

const STEPS = [
  { t: "Submit with a source", d: "Propose the change and paste the published source it comes from. A name is all that's asked." },
  { t: "A named moderator reviews", d: "The claim is checked against the source. What can't be verified is returned, not published." },
  { t: "It joins the record", d: "The entry updates with your name on it, and the previous version stays in the public history." },
];

export async function LedgerSection() {
  const { rows, total } = await getLedgerFeed();
  return (
    <section className="lsec">
      <div className="lwrap ledger-grid">
        <div>
          <span className="lbadge">THE LEDGER</span>
          <h2 className="lh2">Corrections,<br />made in public.</h2>
          <p className="lsub" style={{ marginBottom: 22 }}>
            Every change carries its author, its source, and its reviewer.
            {total > 0
              ? ` The feed below is how the archive looks after ${formatNumber(total)} edits.`
              : " The feed below fills in as edits land."}
          </p>
          <div>
            {rows.length === 0 ? (
              <div className="ledger-row">
                <div className="ledger-sub">
                  <span className="ledger-note">No public edits yet.</span>
                </div>
              </div>
            ) : (
              rows.map((l) => (
                <div key={l.title + l.when} className="ledger-row">
                  <div className="ledger-top">
                    <span>{l.title}</span>
                    <span className={l.pending ? "pending" : "ok"}>
                      {l.pending ? "\u25cf IN REVIEW" : "\u2713 REVIEWED"}
                    </span>
                  </div>
                  <div className="ledger-sub">
                    <span className="ledger-note">{l.summary}</span>
                    <span className="ledger-when">{l.when}</span>
                  </div>
                </div>
              ))
            )}
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
