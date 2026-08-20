import { byCurrency, kindLabel, UNKNOWN_CURRENCY, type FlowRow } from "@/lib/funding/flow";
import { formatAmount } from "@/lib/funding/labels";

/**
 * Recorded funding between organisation kinds.
 *
 * The entity-level canvas draws a forest at this size and the eye gets nothing
 * from it. The same transactions grouped by kind read at a glance, because
 * aggregation is what buys legibility when n is small.
 *
 * Every currency gets its own block with its own scale. A bar is only ever
 * drawn against other bars in the same currency, so no rupee figure is ever
 * rendered longer or shorter than a dollar one. Nothing is converted, because
 * a conversion is a number no source states.
 *
 * n is on the view, not in a footnote: the count of transactions behind each
 * row, the ones with no amount recorded, and the ones left off the view
 * entirely because an end of them is not an organisation.
 */
export function FlowView({
  rows,
  covered,
  excluded,
}: {
  rows: FlowRow[];
  covered: number;
  excluded: number;
}) {
  if (rows.length === 0) return null;
  const groups = byCurrency(rows);

  /* Built as a string rather than as JSX text. A JSX text node that spans
     lines is trimmed line by line, which silently swallows the space next to
     an interpolation: "The 26recorded transactions" is what that looks like in
     the browser, and it is invisible in the source. */
  const intro = [
    `The ${covered} recorded ${covered === 1 ? "transaction that runs" : "transactions that run"} between two organisations, grouped by what kind each end is.`,
    "Kinds come from each organisation's own record. This groups them; it does not say two organisations of one kind have anything to do with each other.",
    excluded > 0
      ? `${excluded} further ${excluded === 1 ? "transaction is" : "transactions are"} recorded with something other than an organisation at one end, so ${excluded === 1 ? "it has" : "they have"} no kind and ${excluded === 1 ? "is" : "are"} not counted here.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="section-card mt-4 px-6 py-8 sm:px-10">
      <h2 className="font-display text-[1.35rem] font-light">Funding between kinds of organisation</h2>
      <p className="mt-1 max-w-[70ch] text-[0.88rem] text-ink-muted">{intro}</p>

      {groups.map((g) => (
        <div key={g.currency} className="mt-6">
          <p className="section-label">
            {g.currency === UNKNOWN_CURRENCY ? "Currency not recorded" : g.currency}
            <span className="text-ink-faint">
              {" · "}
              {g.transactions} {g.transactions === 1 ? "transaction" : "transactions"}
              {g.unpriced > 0 && `, ${g.unpriced} with no amount recorded`}
            </span>
          </p>
          {/* Each currency scales to its own maximum. Sharing one scale across
              currencies would draw ₹1 crore and USD 1 crore at lengths a
              reader would compare, and they are not comparable. */}
          <ul className="flow-rows">
            {g.rows.map((r) => (
              <li key={`${r.donorKind}>${r.recipientKind}`} className="flow-row">
                <p className="flow-pair">
                  <span>{kindLabel(r.donorKind)}</span>
                  <span className="flow-arrow" aria-label="funded">
                    {" to "}
                  </span>
                  <span>{kindLabel(r.recipientKind)}</span>
                </p>
                <div className="flow-bar-track">
                  <div
                    className="flow-bar"
                    style={{ width: `${g.max > 0 ? (r.total / g.max) * 100 : 0}%` }}
                  />
                </div>
                <p className="flow-figures">
                  <span className="flow-total">
                    {r.total > 0
                      ? (formatAmount(String(r.total), g.currency === UNKNOWN_CURRENCY ? null : g.currency) ??
                        String(r.total))
                      : "No amount recorded"}
                  </span>
                  <span className="flow-n">
                    {r.transactions} {r.transactions === 1 ? "transaction" : "transactions"}
                    {r.unpriced > 0 && `, ${r.unpriced} with no amount`}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="mt-6 max-w-[70ch] text-[0.82rem] text-ink-faint">
        Amounts are never added across currencies and nothing is converted. A total is the sum of
        what sources stated in that currency, and a transaction whose amount was not recorded is
        counted but not totalled.
      </p>
    </section>
  );
}
