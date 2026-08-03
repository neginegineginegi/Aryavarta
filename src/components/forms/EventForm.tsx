"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { proposeRevision, type ProposeResult } from "@/actions/propose";
import { Field, FormError, inputClass, SubmitButton } from "@/components/forms/fields";
import {
  draftsToSources,
  emptySource,
  SourceFieldset,
  type SourceDraft,
} from "@/components/forms/SourceFieldset";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/format";
import type { EventPayload } from "@/lib/revisions/payloads";

type StateOption = { id: string; name: string };

export function EventForm({
  states,
  defaultStateId,
  edit,
}: {
  states: StateOption[];
  defaultStateId?: string;
  edit?: { entityId: string; payload: EventPayload };
}) {
  const p = edit?.payload;
  const [stateId, setStateId] = useState(p?.stateId ?? defaultStateId ?? "");
  const [year, setYear] = useState(p?.year ? String(p.year) : "");
  const [eventDate, setEventDate] = useState(p?.eventDate ?? "");
  const [type, setType] = useState<EventType | "">(p?.type ?? "");
  const [title, setTitle] = useState(p?.title ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
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

  if (result?.ok) {
    return <SubmittedPanel revisionId={result.revisionId} isEdit={!!edit} />;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await proposeRevision({
        entityType: "event",
        action: edit ? "update" : "create",
        entityId: edit?.entityId,
        summary,
        payload: {
          stateId,
          year: Number(year),
          eventDate: eventDate || null,
          type,
          title,
          description,
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
        <Field label="Event type" required error={errors["type"]}>
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
            required
          >
            <option value="">Select…</option>
            {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Year" required error={errors["year"]}>
          <input
            className={inputClass}
            type="number"
            min={1947}
            max={new Date().getFullYear()}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            required
          />
        </Field>
        <Field
          label="Exact date"
          error={errors["eventDate"]}
          hint="Optional — only if reliably known"
        >
          <input
            className={inputClass}
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Title" required error={errors["title"]} hint="Neutral and specific; avoid loaded wording">
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={10}
          maxLength={200}
          required
        />
      </Field>

      <Field
        label="Description"
        required
        error={errors["description"]}
        hint="What happened, per the cited sources. Attribute claims ('according to…', 'alleged') rather than asserting them."
      >
        <textarea
          className={`${inputClass} min-h-40`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minLength={40}
          maxLength={8000}
          required
        />
      </Field>

      <SourceFieldset sources={sources} onChange={setSources} errors={errors} />

      <Field
        label="Edit summary"
        required
        error={errors["_"]}
        hint="One line for the review log: what you're adding or changing, and why"
      >
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

export function SubmittedPanel({ revisionId, isEdit }: { revisionId: string; isEdit: boolean }) {
  return (
    <div className="rounded-sm border border-green-200 bg-green-50 p-5">
      <h2 className="font-display text-xl font-semibold text-approved">
        Submitted for review
      </h2>
      <p className="mt-2 text-[0.9rem] text-ink-muted">
        Your {isEdit ? "correction" : "submission"} is now in the moderation queue. It will not
        appear publicly until a moderator verifies it against your sources. You can track or
        withdraw it from your{" "}
        <Link href="/contribute" className="text-accent underline-offset-2 hover:underline">
          contributions page
        </Link>
        .
      </p>
      <p className="mt-2 text-[0.75rem] text-ink-faint">Reference: {revisionId}</p>
    </div>
  );
}
