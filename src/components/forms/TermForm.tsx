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
import type { TermPayload } from "@/lib/revisions/payloads";

type StateOption = { id: string; name: string };
type PartyOption = { id: string; name: string; isPseudo: boolean };

export function TermForm({
  states,
  parties,
  defaultStateId,
  edit,
}: {
  states: StateOption[];
  parties: PartyOption[];
  defaultStateId?: string;
  edit?: { entityId: string; payload: TermPayload };
}) {
  const p = edit?.payload;
  const [stateId, setStateId] = useState(p?.stateId ?? defaultStateId ?? "");
  const [kind, setKind] = useState<"cm" | "presidents_rule" | "pm" | "president" | "governor">(
    p?.kind ?? "cm",
  );
  const [cmName, setCmName] = useState(p?.cmName ?? "");
  const [partyId, setPartyId] = useState(p?.partyId ?? "");
  const [startDate, setStartDate] = useState(p?.startDate ?? "");
  const [endDate, setEndDate] = useState(p?.endDate ?? "");
  const [ongoing, setOngoing] = useState(p ? p.endDate === null : false);
  const [notes, setNotes] = useState(p?.notes ?? "");
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
  const isUnion = stateId === "in";
  // Keep the kind consistent with the selected entity (state vs union).
  const effectiveKind = isUnion
    ? kind === "pm" || kind === "president"
      ? kind
      : "pm"
    : kind === "cm" || kind === "presidents_rule" || kind === "governor"
      ? kind
      : "cm";
  const isPR = effectiveKind === "presidents_rule";
  // Presidents and Governors: party optional (conventionally non-partisan).
  const isPresident = effectiveKind === "president" || effectiveKind === "governor";
  const personLabel =
    effectiveKind === "pm"
      ? "Prime Minister"
      : effectiveKind === "president"
        ? "President"
        : effectiveKind === "governor"
          ? "Governor"
          : "Chief Minister";

  if (result?.ok) return <SubmittedPanel revisionId={result.revisionId} isEdit={!!edit} />;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await proposeRevision({
        entityType: "term",
        action: edit ? "update" : "create",
        entityId: edit?.entityId,
        summary,
        payload: {
          stateId,
          kind: effectiveKind,
          cmName: isPR ? null : cmName,
          partyId: isPR ? null : partyId || null,
          startDate,
          endDate: ongoing ? null : endDate || null,
          notes: notes || null,
          sources: draftsToSources(sources),
        },
      });
      setResult(res);
      if (!res.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    });
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
        <Field label="Kind" required error={errors["kind"]}>
          <select
            className={inputClass}
            value={effectiveKind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {isUnion ? (
              <>
                <option value="pm">Prime Minister term</option>
                <option value="president">President term</option>
              </>
            ) : (
              <>
                <option value="cm">Chief Minister term</option>
                <option value="presidents_rule">President&rsquo;s Rule</option>
                <option value="governor">Governor term</option>
              </>
            )}
          </select>
        </Field>
        {!isPR && (
          <>
            <Field label={personLabel} required error={errors["cmName"]}>
              <input
                className={inputClass}
                value={cmName}
                onChange={(e) => setCmName(e.target.value)}
                placeholder="Full name as commonly published"
                maxLength={150}
                required={!isPR}
              />
            </Field>
            <Field
              label="Party"
              required={!isPresident}
              error={errors["partyId"]}
              hint={isPresident ? "Optional — Presidents are conventionally shown without party" : undefined}
            >
              <select
                className={inputClass}
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                required={!isPR && !isPresident}
              >
                <option value="">Select…</option>
                {parties.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Start date" required error={errors["startDate"]}>
          <input
            className={inputClass}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </Field>
        <div>
          <Field label="End date" error={errors["endDate"]}>
            <input
              className={inputClass}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={ongoing}
            />
          </Field>
          <label className="mt-2 flex items-center gap-2 text-[0.82rem] text-ink-muted">
            <input
              type="checkbox"
              checked={ongoing}
              onChange={(e) => setOngoing(e.target.checked)}
            />
            Currently in office / ongoing
          </label>
        </div>
      </div>

      <Field label="Notes" error={errors["notes"]} hint="Optional — coalition partners, caretaker status, etc.">
        <input
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
      </Field>

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
