"use client";

import type { EdgeEvidence } from "@/lib/db/queries/network";
import type { GraphEdge, GraphNode } from "@/lib/funding/graph-types";
import { bySourceStrength } from "@/lib/funding/source-rank";
import {
  edgeLabel,
  EVIDENCE_LABELS,
  EVIDENCE_MEANING,
  formatAmount,
  formatPeriod,
} from "@/lib/funding/labels";

/**
 * What is behind one line on the graph.
 *
 * The panel answers the four questions the handoff asks of every relationship,
 * in order: what it is, what supports it, when it held, and what is not known.
 * The last is not decoration. A panel that lists three sources and says nothing
 * about the gaps reads as completeness, and this layer is not complete about
 * anything yet.
 */
export function EvidencePanel({
  edge,
  nodes,
  evidence,
}: {
  edge: GraphEdge;
  nodes: GraphNode[];
  evidence: EdgeEvidence[] | null;
}) {
  const label = (r: { type: string; id: string }) =>
    nodes.find((n) => n.type === r.type && n.id === r.id)?.label ?? r.id;

  const amount = formatAmount(edge.amount, edge.currency);
  const period = formatPeriod(edge.yearFrom, edge.yearTo);
  const sorted = evidence ? [...evidence].sort(bySourceStrength) : null;

  return (
    <div className="net-card" data-edge={edge.edgeId}>
      <p className="net-card-kind">
        {edge.interpretive ? "Asserted claim" : "Documented relationship"}
      </p>

      {/* Each part is its own element with a single text child. Three bare
          text expressions between two <strong>s share one parent, and React
          patched the endpoints while leaving the verb from the previously
          selected edge in place: every relationship read "funded". */}
      <p className="net-edge-statement">
        <strong>{label(edge.from)}</strong>
        <span> {edgeLabel(edge.kind, edge.interpretive)} </span>
        <strong>{label(edge.to)}</strong>
      </p>

      <dl className="net-facts">
        <div>
          <dt>Evidence</dt>
          <dd>
            <span className={`ev ev-${edge.evidenceStatus}`}>
              {EVIDENCE_LABELS[edge.evidenceStatus] ?? edge.evidenceStatus}
            </span>
            <span className="net-facts-note">{EVIDENCE_MEANING[edge.evidenceStatus]}</span>
          </dd>
        </div>
        {amount && (
          <div>
            <dt>Amount</dt>
            <dd>
              {amount}
              <span className="net-facts-note">
                As the source states it. Amounts are never converted here, because the rate and its
                date would be claims of their own.
              </span>
            </dd>
          </div>
        )}
        <div>
          <dt>Period</dt>
          <dd>
            {period ?? "Not recorded"}
            {!period && (
              <span className="net-facts-note">
                No dates are held for this relationship. That is a gap in the record, not evidence
                that it was brief.
              </span>
            )}
          </dd>
        </div>
        {edge.detail && (
          <div>
            <dt>{edge.interpretive ? "The claim" : "Stated purpose"}</dt>
            <dd>{edge.detail}</dd>
          </div>
        )}
      </dl>

      <h4 className="net-card-h">Sources</h4>
      {sorted === null && <p className="net-card-sub">Loading…</p>}
      {sorted !== null && sorted.length === 0 && (
        <p className="net-nosource">
          No source is recorded against this relationship. Until one is, it should not be relied on,
          and it will not survive review.
        </p>
      )}
      {sorted !== null && sorted.length > 0 && (
        <ul className="net-sources">
          {sorted.map((s) => (
            <li key={s.sourceId}>
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                {s.title}
              </a>
              <span className="net-source-meta">
                {[
                  s.publisher,
                  s.publishedOn?.slice(0, 4),
                  s.isPrimary ? "primary document" : null,
                  s.isOfficial ? "official" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {s.note ? (
                <span className="net-source-note">{s.note}</span>
              ) : (
                <span className="net-source-note is-missing">
                  No page or clause reference recorded.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <h4 className="net-card-h">What this does not say</h4>
      <p className="net-card-sub">
        {edge.interpretive
          ? "This is what somebody asserts, recorded with its source. The archive holds no finding on whether it is so."
          : "This records one relationship. It says nothing about why it exists, what either party intended, or what followed from it."}
      </p>
    </div>
  );
}
