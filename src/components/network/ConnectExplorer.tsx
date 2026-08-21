"use client";

import { useCallback, useState } from "react";

import {
  findPathsAction,
  sharedConnectionsAction,
  type OverlapItem,
  type ResolvedPath,
} from "@/actions/network-connect";
import { edgeEvidenceAction } from "@/actions/network";
import { EntityPicker } from "@/components/network/EntityPicker";
import type { EdgeEvidence, NodeHit } from "@/lib/db/queries/network";
import type { GraphEdge } from "@/lib/funding/graph-types";
import { edgeLabel, EVIDENCE_LABELS, EVIDENCE_MEANING, formatPeriod } from "@/lib/funding/labels";
import { RATE_LIMIT_MESSAGE } from "@/lib/rate-limit-shared";

/**
 * "What connects these two?"
 *
 * Two answers to one question, which is why they share a page. A path is a
 * chain of recorded relationships from one entity to the other. An overlap is
 * a third entity both are recorded as connected to. Neither is a finding, and
 * the copy says so where a reader will actually read it rather than in a
 * footnote.
 */
export function ConnectExplorer({
  initialA,
  initialB,
}: {
  initialA: NodeHit | null;
  initialB: NodeHit | null;
}) {
  const [a, setA] = useState<NodeHit | null>(initialA);
  const [b, setB] = useState<NodeHit | null>(initialB);
  const [depth, setDepth] = useState(4);
  const [includeClaims, setIncludeClaims] = useState(false);
  const [paths, setPaths] = useState<ResolvedPath[] | null>(null);
  const [overlap, setOverlap] = useState<OverlapItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const [openEdge, setOpenEdge] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, EdgeEvidence[]>>({});

  const run = useCallback(async () => {
    if (!a || !b) return;
    setBusy(true);
    setPaths(null);
    setOverlap(null);
    try {
      const ra = { type: a.type, id: a.id };
      const rb = { type: b.type, id: b.id };
      const [p, o] = await Promise.all([
        findPathsAction(ra, rb, depth, includeClaims),
        sharedConnectionsAction(ra, rb, includeClaims),
      ]);
      // A refusal is not a result. Rendering [] here would state "no
      // documented paths", which the server did not say.
      if ("rateLimited" in p || "rateLimited" in o) {
        setLimitNote(RATE_LIMIT_MESSAGE);
        return;
      }
      setLimitNote(null);
      setPaths(p);
      setOverlap(o);
    } finally {
      setBusy(false);
    }
  }, [a, b, depth, includeClaims]);

  const toggleEdge = useCallback(
    async (edge: GraphEdge) => {
      if (openEdge === edge.edgeId) {
        setOpenEdge(null);
        return;
      }
      setOpenEdge(edge.edgeId);
      if (!evidence[edge.edgeId]) {
        const found = await edgeEvidenceAction(edge.citationSubject, edge.citationSubjectId);
        if ("rateLimited" in found) {
          setLimitNote(RATE_LIMIT_MESSAGE);
          return;
        }
        setLimitNote(null);
        setEvidence((prev) => ({ ...prev, [edge.edgeId]: found }));
      }
    },
    [openEdge, evidence],
  );

  const sameEntity = a && b && a.type === b.type && a.id === b.id;

  return (
    <div className="net-connect">
      <div className="net-connect-controls">
        <EntityPicker label="Start" value={a} onChange={setA} />
        <EntityPicker label="Target" value={b} onChange={setB} />
        <div className="net-connect-opts">
          <label>
            Up to
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              <option value={2}>2 steps</option>
              <option value={3}>3 steps</option>
              <option value={4}>4 steps</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeClaims}
              onChange={(e) => setIncludeClaims(e.target.checked)}
            />
            Include asserted claims
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={run}
            disabled={!a || !b || !!sameEntity || busy}
          >
            {busy ? "Searching…" : "Find connections"}
          </button>
        </div>
        {limitNote && <p className="net-warn">{limitNote}</p>}
        {sameEntity && <p className="net-warn">Pick two different entities.</p>}
      </div>

      {includeClaims && (
        <p className="net-claim-warning">
          Asserted claims are now included. A path running through one is not a documented path:
          it contains a step somebody says is so.
        </p>
      )}

      {paths !== null && (
        <section className="net-result">
          <h2>Documented paths</h2>
          {paths.length === 0 ? (
            <p className="net-card-sub">
              No chain of recorded relationships connects these two within {depth} steps. That is a
              statement about what the archive holds, not about the world.
            </p>
          ) : (
            <>
              <p className="net-card-sub">
                {paths.length} {paths.length === 1 ? "path" : "paths"}, shortest first. A path is a
                chain of recorded relationships. It does not mean the two ends are connected in any
                sense beyond the steps it lists.
              </p>
              <ol className="net-paths">
                {paths.map((p, i) => (
                  <li key={i}>
                    <div className="net-path-head">
                      <span className="net-path-hops">
                        {p.hops} {p.hops === 1 ? "step" : "steps"}
                      </span>
                      <span className={`ev ev-${p.weakest}`}>
                        weakest step: {EVIDENCE_LABELS[p.weakest] ?? p.weakest}
                      </span>
                    </div>
                    <ol className="net-path-steps">
                      {p.steps.map((s, j) => (
                        <li key={j}>
                          <span className="net-path-from">{s.from.label}</span>{" "}
                          {s.edge ? (
                            <button type="button" onClick={() => toggleEdge(s.edge!)}>
                              {edgeLabel(s.edge.kind, s.edge.interpretive)}
                            </button>
                          ) : (
                            <span>is connected to</span>
                          )}{" "}
                          <span className="net-path-to">{s.to.label}</span>{" "}
                          {s.edge && (
                            <span className={`ev ev-${s.edge.evidenceStatus}`}>
                              {EVIDENCE_LABELS[s.edge.evidenceStatus]}
                            </span>
                          )}
                          {s.edge && openEdge === s.edge.edgeId && (
                            <StepEvidence edge={s.edge} rows={evidence[s.edge.edgeId]} />
                          )}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      {overlap !== null && (
        <section className="net-result">
          <h2>Documented overlap</h2>
          {overlap.length === 0 ? (
            <p className="net-card-sub">
              Nothing is recorded as connected to both.
            </p>
          ) : (
            <>
              <p className="net-card-sub">
                {overlap.length} {overlap.length === 1 ? "entity is" : "entities are"} recorded as
                connected to both, strongest evidence first. Shared connections are shared
                connections. They are not coordination, and the archive holds no finding either
                way.
              </p>
              <ul className="net-overlap">
                {overlap.map((o) => (
                  <li key={`${o.node.type}:${o.node.id}`}>
                    <p className="net-overlap-name">{o.node.label}</p>
                    <div className="net-overlap-sides">
                      <Side title={a?.label ?? "Start"} edges={o.viaA} onPick={toggleEdge} />
                      <Side title={b?.label ?? "Target"} edges={o.viaB} onPick={toggleEdge} />
                    </div>
                    {[...o.viaA, ...o.viaB].map(
                      (e) =>
                        openEdge === e.edgeId && (
                          <StepEvidence key={e.edgeId} edge={e} rows={evidence[e.edgeId]} />
                        ),
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Side({
  title,
  edges,
  onPick,
}: {
  title: string;
  edges: GraphEdge[];
  onPick: (e: GraphEdge) => void;
}) {
  return (
    <div>
      <p className="net-overlap-side-title">{title}</p>
      <ul>
        {edges.map((e) => (
          <li key={e.edgeId}>
            <button type="button" onClick={() => onPick(e)}>
              {edgeLabel(e.kind, e.interpretive)}
            </button>{" "}
            <span className={`ev ev-${e.evidenceStatus}`}>
              {EVIDENCE_LABELS[e.evidenceStatus]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepEvidence({ edge, rows }: { edge: GraphEdge; rows: EdgeEvidence[] | undefined }) {
  const period = formatPeriod(edge.yearFrom, edge.yearTo);
  return (
    <div className="net-step-evidence">
      <p className="net-facts-note">{EVIDENCE_MEANING[edge.evidenceStatus]}</p>
      {period && <p className="net-facts-note">Recorded period: {period}.</p>}
      {rows === undefined && <p className="net-facts-note">Loading sources…</p>}
      {rows?.length === 0 && (
        <p className="net-nosource">No source is recorded against this step.</p>
      )}
      {rows && rows.length > 0 && (
        <ul className="net-sources">
          {rows.map((s) => (
            <li key={s.sourceId}>
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                {s.title}
              </a>
              <span className="net-source-meta">
                {[s.publisher, s.publishedOn?.slice(0, 4), s.note].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
