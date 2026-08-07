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
import {
  DOCUMENT_TYPE_LABELS,
  PROMISE_CATEGORY_LABELS,
  PROMISE_SCOPE_LABELS,
} from "@/lib/format";
import type { PromisePayload } from "@/lib/revisions/payloads";

export type DocumentOption = {
  id: string;
  title: string;
  type: string;
  publishedOn: string | null;
  partyId: string | null;
  partyName: string | null;
  electionId: string | null;
  stateId: string | null;
  stateName: string | null;
};

/**
 * Extraction form: quote one promise out of a document already in the archive.
 *
 * Two rules shape it. The quoted wording is transcribed, never summarised in
 * place, so `officialText` is the required field and any restatement goes in a
 * separate box that the page labels as editorial. And party, election and state
 * are inherited from the document rather than picked, because a promise belongs
 * to whoever issued the document it appears in.
 *
 * There is no "was it kept" field, by design. See docs/ACCOUNTABILITY_LAYER.md.
 */
export function PromiseForm({
  documents,
  defaultDocumentId,
  edit,
}: {
  documents: DocumentOption[];
  defaultDocumentId?: string;
  edit?: { entityId: string; payload: PromisePayload };
}) {
  const p = edit?.payload;
  const [documentId, setDocumentId] = useState(p?.documentId ?? defaultDocumentId ?? "");
  const [officialText, setOfficialText] = useState(p?.officialText ?? "");
  const [officialLang, setOfficialLang] = useState(p?.officialLang ?? "en");
  const [plainText, setPlainText] = useState(p?.plainText ?? "");
  const [category, setCategory] = useState(p?.category ?? "other");
  const [scope, setScope] = useState(p?.scope ?? "unspecified");
  const [statedTimeline, setStatedTimeline] = useState(p?.statedTimeline ?? "");
  const [statedBudgetInr, setStatedBudgetInr] = useState(p?.statedBudgetInr ?? "");
  const [pageRef, setPageRef] = useState(p?.pageRef ?? "");
  const [sortOrder, setSortOrder] = useState(p?.sortOrder ? String(p.sortOrder) : "");
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
  const doc = documents.find((d) => d.id === documentId);

  if (result?.ok) {
    return <SubmittedPanel revisionId={result.revisionId} isEdit={!!edit} />;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await proposeRevision({
        entityType: "manifesto_promise",
        action: edit ? "update" : "create",
        entityId: edit?.entityId,
        summary,
        payload: {
          documentId,
          partyId: doc?.partyId ?? null,
          electionId: doc?.electionId ?? null,
          stateId: doc?.stateId ?? null,
          officialText,
          officialLang,
          plainText: plainText || null,
          category,
          scope,
          statedTimeline: statedTimeline || null,
          statedBudgetInr: statedBudgetInr || null,
          pageRef: pageRef || null,
          sortOrder: sortOrder ? Number(sortOrder) : 0,
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

      <Field
        label="Document"
        required
        error={errors["documentId"]}
        hint="The promise has to come from a document already in the archive, so a reader can check it"
      >
        <select
          className={inputClass}
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          disabled={!!edit}
          required
        >
          <option value="">Select…</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} ({DOCUMENT_TYPE_LABELS[d.type] ?? d.type}
              {d.publishedOn ? `, ${d.publishedOn.slice(0, 4)}` : ""})
            </option>
          ))}
        </select>
      </Field>

      {doc && (
        <p className="rounded-sm border border-rule bg-paper-sunken px-3 py-2 text-[0.78rem] text-ink-muted">
          Inherited from this document: {doc.partyName ?? "no party recorded"} ·{" "}
          {doc.stateName ?? "national"}
          {doc.electionId ? " · linked to an election" : ""}. A promise belongs to whoever issued
          the document it appears in, so these are not set separately.
        </p>
      )}

      <Field
        label="The promise, as written"
        required
        error={errors["officialText"]}
        hint="Transcribe it word for word. Do not tidy it up, shorten it, or fix its grammar."
      >
        <textarea
          className={`${inputClass} min-h-32`}
          value={officialText}
          onChange={(e) => setOfficialText(e.target.value)}
          minLength={10}
          maxLength={4000}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Language of the quote"
          error={errors["officialLang"]}
          hint="ISO code, e.g. en, hi, ta"
        >
          <input
            className={inputClass}
            value={officialLang}
            onChange={(e) => setOfficialLang(e.target.value)}
            minLength={2}
            maxLength={8}
          />
        </Field>
        <Field
          label="Where in the document"
          error={errors["pageRef"]}
          hint="e.g. p. 14, or Section 3.2"
        >
          <input
            className={inputClass}
            value={pageRef}
            onChange={(e) => setPageRef(e.target.value)}
            maxLength={60}
          />
        </Field>
        <Field
          label="Order in the document"
          error={errors["sortOrder"]}
          hint="Optional; keeps the manifesto's own sequence"
        >
          <input
            className={inputClass}
            type="number"
            min={0}
            max={100000}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="In plain terms"
        error={errors["plainText"]}
        hint="Optional restatement for readers. It is published under an editorial label, never as the party's words."
      >
        <textarea
          className={`${inputClass} min-h-24`}
          value={plainText}
          onChange={(e) => setPlainText(e.target.value)}
          maxLength={2000}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject" required error={errors["category"]}>
          <select
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            required
          >
            {Object.entries(PROMISE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Scope"
          required
          error={errors["scope"]}
          hint="Only as the document states it; leave unstated if it does not say"
        >
          <select
            className={inputClass}
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            required
          >
            {Object.entries(PROMISE_SCOPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Timeline, as the document states it"
          error={errors["statedTimeline"]}
          hint="Its own words, e.g. 'within five years'. Leave blank if it sets none."
        >
          <input
            className={inputClass}
            value={statedTimeline}
            onChange={(e) => setStatedTimeline(e.target.value)}
            maxLength={200}
          />
        </Field>
        <Field
          label="Amount in rupees, as the document states it"
          error={errors["statedBudgetInr"]}
          hint="Digits only. Leave blank if it names no figure; do not estimate one."
        >
          <input
            className={inputClass}
            type="number"
            min={0}
            step="1"
            value={statedBudgetInr}
            onChange={(e) => setStatedBudgetInr(e.target.value)}
          />
        </Field>
      </div>

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
