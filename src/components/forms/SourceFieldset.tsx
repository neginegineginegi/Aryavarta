"use client";

import { Field, inputClass } from "@/components/forms/fields";

export type SourceDraft = {
  title: string;
  url: string;
  publisher: string;
  publishedOn: string;
  accessedOn: string;
};

export const emptySource = (): SourceDraft => ({
  title: "",
  url: "",
  publisher: "",
  publishedOn: "",
  accessedOn: new Date().toISOString().slice(0, 10),
});

/**
 * Dynamic list of source citations. The archive's hard rule: at least one
 * source per submission — the last row cannot be removed, and the server
 * validates again regardless.
 */
export function SourceFieldset({
  sources,
  onChange,
  errors,
}: {
  sources: SourceDraft[];
  onChange: (next: SourceDraft[]) => void;
  errors?: Record<string, string>;
}) {
  function update(i: number, patch: Partial<SourceDraft>) {
    onChange(sources.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  return (
    <fieldset className="rounded-sm border border-rule bg-paper-sunken/50 p-4">
      <legend className="section-label px-1">
        Sources <span className="normal-case text-danger">(at least one required)</span>
      </legend>
      <div className="space-y-5">
        {sources.map((s, i) => (
          <div key={i} className="rounded-sm border border-rule bg-paper-raised p-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[0.78rem] font-medium text-ink-muted">Source {i + 1}</p>
              {sources.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(sources.filter((_, j) => j !== i))}
                  className="text-[0.78rem] text-danger hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Title" required error={errors?.[`sources.${i}.title`]}>
                  <input
                    className={inputClass}
                    value={s.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    placeholder="Headline or document title"
                    maxLength={300}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="URL"
                  required
                  error={errors?.[`sources.${i}.url`]}
                  hint="A stable link (news article, gazette, court order, report)"
                >
                  <input
                    className={inputClass}
                    type="url"
                    value={s.url}
                    onChange={(e) => update(i, { url: e.target.value })}
                    placeholder="https://…"
                    maxLength={2000}
                  />
                </Field>
              </div>
              <Field label="Publisher" error={errors?.[`sources.${i}.publisher`]}>
                <input
                  className={inputClass}
                  value={s.publisher}
                  onChange={(e) => update(i, { publisher: e.target.value })}
                  placeholder="e.g. The Hindu"
                  maxLength={200}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Published" error={errors?.[`sources.${i}.publishedOn`]}>
                  <input
                    className={inputClass}
                    type="date"
                    value={s.publishedOn}
                    onChange={(e) => update(i, { publishedOn: e.target.value })}
                  />
                </Field>
                <Field label="Accessed" error={errors?.[`sources.${i}.accessedOn`]}>
                  <input
                    className={inputClass}
                    type="date"
                    value={s.accessedOn}
                    onChange={(e) => update(i, { accessedOn: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </div>
        ))}
      </div>
      {sources.length < 10 && (
        <button
          type="button"
          onClick={() => onChange([...sources, emptySource()])}
          className="mt-3 text-[0.82rem] text-accent hover:underline"
        >
          + Add another source
        </button>
      )}
    </fieldset>
  );
}

/** Convert form drafts to the payload's source shape (empty strings → null). */
export function draftsToSources(drafts: SourceDraft[]) {
  return drafts.map((d) => ({
    title: d.title,
    url: d.url,
    publisher: d.publisher || null,
    publishedOn: d.publishedOn || null,
    accessedOn: d.accessedOn || null,
  }));
}
