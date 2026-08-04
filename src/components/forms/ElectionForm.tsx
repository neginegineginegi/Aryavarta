"use client";

import { useState, useTransition } from "react";

import { proposeRevision, type ProposeResult } from "@/actions/propose";
import { SubmittedPanel } from "@/components/forms/EventForm";
import { Field, FormError, inputClass, SubmitButton } from "@/components/forms/fields";
import {
  draftsToSources,
  emptySource,
  SourceFieldset,
  type SourceDraft,
} from "@/components/forms/SourceFieldset";
import type { ElectionPayload } from "@/lib/revisions/payloads";

type StateOption = { id: string; name: string };
type PartyOption = { id: string; name: string; isPseudo: boolean };
type ResultDraft = { partyId: string; seats: string; voteSharePercent: string };

export function ElectionForm({
  states,
  parties,
  defaultStateId,
  edit,
}: {
  states: StateOption[];
  parties: PartyOption[];
  defaultStateId?: string;
  edit?: { entityId: string; payload: ElectionPayload };
}) {
  const p = edit?.payload;
  const [stateId, setStateId] = useState(p?.stateId ?? defaultStateId ?? "");
  const [electionDate, setElectionDate] = useState(p?.electionDate ?? "");
  const [totalSeats, setTotalSeats] = useState(p?.totalSeats ? String(p.totalSeats) : "");
  const [turnout, setTurnout] = useState(p?.turnoutPercent != null ? String(p.turnoutPercent) : "");
  const [resultSummary, setResultSummary] = useState(p?.resultSummary ?? "");
  const [results, setResults] = useState<ResultDraft[]>(
    p?.results.map((r) => ({
      partyId: r.partyId,
      seats: String(r.seats),
      voteSharePercent: r.voteSharePercent != null ? String(r.voteSharePercent) : "",
    })) ?? [],
  );
  const [sources, setSources] = useState<SourceDraft[]>(
    p?.sources.map((s) => ({
      title: s.title,
      url: s.url,
      publisher: s.publisher ?? "",
      publishedOn: s.publishedOn ?? "",
      accessedOn: s.accessedOn ?? "",
    })) ?? [emptySource()],
  );
  const [summary, setSummary] = useState("");
  const [result, setResult] = useState<ProposeResult | null>(null);
  const [pending, startTransition] = useTransition();

  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  if (result?.ok) return <SubmittedPanel revisionId={result.revisionId} isEdit={!!edit} />;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await proposeRevision({
        entityType: "election",
        action: edit ? "update" : "create",
        entityId: edit?.entityId,
        summary,
        payload: {
          stateId,
          scope: stateId === "in" ? "lok_sabha" : "state_assembly",
          assemblyNumber: p?.assemblyNumber ?? null,
          electionDate,
          resultSummary: resultSummary || null,
          totalSeats: totalSeats ? Number(totalSeats) : null,
          turnoutPercent: turnout ? Number(turnout) : null,
          results: results
            .filter((r) => r.partyId)
            .map((r) => ({
              partyId: r.partyId,
              seats: Number(r.seats || 0),
              voteSharePercent: r.voteSharePercent ? Number(r.voteSharePercent) : null,
            })),
          sources: draftsToSources(sources),
        },
      });
      setResult(res);
      if (!res.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function updateResult(i: number, patch: Partial<ResultDraft>) {
    setResults(results.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormError message={result && !result.ok ? result.error : null} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="State / Union Territory" required error={errors["stateId"]}>
          <select
            className={inputClass}
            value={stateId}
            onChange={(e) => setStateId(e.target.value)}
            disabled={!!edit}
            required
          >
            <option value="">Select…</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Election date" required error={errors["electionDate"]} hint="Polling date (first phase if multi-phase)">
          <input
            className={inputClass}
            type="date"
            value={electionDate}
            onChange={(e) => setElectionDate(e.target.value)}
            required
          />
        </Field>
        <Field label="Total seats" error={errors["totalSeats"]}>
          <input
            className={inputClass}
            type="number"
            min={1}
            max={1000}
            value={totalSeats}
            onChange={(e) => setTotalSeats(e.target.value)}
          />
        </Field>
        <Field label="Turnout %" error={errors["turnoutPercent"]}>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min={0}
            max={100}
            value={turnout}
            onChange={(e) => setTurnout(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Result summary" error={errors["resultSummary"]} hint="Neutral one-paragraph summary of the outcome">
        <textarea
          className={`${inputClass} min-h-24`}
          value={resultSummary}
          onChange={(e) => setResultSummary(e.target.value)}
          maxLength={2000}
        />
      </Field>

      <fieldset className="rounded-sm border border-rule bg-paper-sunken/50 p-4">
        <legend className="section-label px-1">Seat counts by party</legend>
        {errors["results"] ? (
          <p className="mb-2 text-[0.78rem] text-danger">{errors["results"]}</p>
        ) : null}
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={i === 0 ? "Party" : ""}>
                  <select
                    className={inputClass}
                    value={r.partyId}
                    onChange={(e) => updateResult(i, { partyId: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {parties.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="w-24">
                <Field label={i === 0 ? "Seats" : ""}>
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    value={r.seats}
                    onChange={(e) => updateResult(i, { seats: e.target.value })}
                  />
                </Field>
              </div>
              <div className="w-28">
                <Field label={i === 0 ? "Vote %" : ""}>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={r.voteSharePercent}
                    onChange={(e) => updateResult(i, { voteSharePercent: e.target.value })}
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => setResults(results.filter((_, j) => j !== i))}
                className="pb-2.5 text-[0.78rem] text-danger hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {results.length < 30 && (
          <button
            type="button"
            onClick={() => setResults([...results, { partyId: "", seats: "", voteSharePercent: "" }])}
            className="mt-3 text-[0.82rem] text-accent hover:underline"
          >
            + Add party result
          </button>
        )}
      </fieldset>

      <SourceFieldset sources={sources} onChange={setSources} errors={errors} />

      <Field label="Edit summary" required hint="One line for the review log">
        <input
          className={inputClass}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          minLength={5}
          maxLength={500}
          required
        />
      </Field>

      <SubmitButton pending={pending}>
        {edit ? "Submit correction for review" : "Submit for review"}
      </SubmitButton>
    </form>
  );
}
