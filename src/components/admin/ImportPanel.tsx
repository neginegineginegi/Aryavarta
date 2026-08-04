"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  commitImport,
  previewImport,
  type ImportKind,
  type PreviewResult,
} from "@/actions/import";
import { Field, FormError, inputClass, SubmitButton } from "@/components/forms/fields";
import type { ImportedElection, ImportedTerm } from "@/lib/import/wikidata";

type StateOption = { id: string; name: string };

export function ImportPanel({ states }: { states: StateOption[] }) {
  const [stateId, setStateId] = useState("");
  const [kind, setKind] = useState<ImportKind>("cm_terms");
  const [qidOverride, setQidOverride] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [commitMsg, setCommitMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview(e: React.FormEvent) {
    e.preventDefault();
    setCommitMsg(null);
    startTransition(async () => {
      const res = await previewImport({ stateId, kind, qidOverride: qidOverride || undefined });
      setPreview(res);
      if (res.ok) {
        const n = res.terms?.length ?? res.elections?.length ?? 0;
        setSelected(new Set(Array.from({ length: n }, (_, i) => i)));
      }
    });
  }

  function runCommit() {
    if (!preview?.ok) return;
    startTransition(async () => {
      const pick = <T,>(arr: T[] | undefined) =>
        (arr ?? []).filter((_, i) => selected.has(i));
      const res = await commitImport({
        stateId,
        kind,
        stateQid: preview.resolution.qid,
        terms: kind === "cm_terms" ? pick(preview.terms) : undefined,
        elections: kind === "elections" ? pick(preview.elections) : undefined,
      });
      if (!res.ok) {
        setCommitMsg(`Error: ${res.error}`);
      } else {
        const skipped = res.outcome.skipped;
        setCommitMsg(
          `Created ${res.outcome.created} draft${res.outcome.created === 1 ? "" : "s"} in the review queue.` +
            (skipped.length
              ? ` Skipped ${skipped.length}: ${skipped
                  .slice(0, 5)
                  .map((s) => `${s.label} (${s.reason})`)
                  .join("; ")}${skipped.length > 5 ? "…" : ""}`
              : ""),
        );
        setPreview(null);
        setSelected(new Set());
      }
    });
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const rows: Array<{ main: string; detail: string }> = !preview?.ok
    ? []
    : kind === "cm_terms"
      ? (preview.terms ?? []).map((t: ImportedTerm) => ({
          main: `${t.personLabel} — ${t.partyLabel ?? "party unknown"}`,
          detail: `${t.startDate ?? "start unknown"} → ${t.endDate ?? "present"}${
            t.startPrecision && t.startPrecision !== "day" ? ` (${t.startPrecision} precision)` : ""
          }`,
        }))
      : (preview.elections ?? []).map((e: ImportedElection) => ({
          main: e.label,
          detail: `${e.electionDate ?? "date unknown"} · ${
            e.totalSeats ? `${e.totalSeats} seats` : "total seats unknown"
          } · ${e.results.length} part${e.results.length === 1 ? "y" : "ies"} with data`,
        }));

  return (
    <div className="space-y-6">
      <form onSubmit={runPreview} className="grid gap-4 sm:grid-cols-3">
        <Field label="State / Union Territory" required>
          <select
            className={inputClass}
            value={stateId}
            onChange={(e) => setStateId(e.target.value)}
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
        <Field label="What to import" required>
          <select
            className={inputClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as ImportKind)}
          >
            {stateId === "in" ? (
              <>
                <option value="cm_terms">Prime Minister history</option>
                <option value="heads_of_state">President history</option>
                <option value="elections">Lok Sabha elections</option>
              </>
            ) : (
              <>
                <option value="cm_terms">Chief Minister history</option>
                <option value="heads_of_state">Governor history</option>
                <option value="elections">Assembly elections</option>
              </>
            )}
          </select>
        </Field>
        <Field label="Wikidata QID override" hint="Only if the automatic match is wrong (e.g. Q1437)">
          <input
            className={inputClass}
            value={qidOverride}
            onChange={(e) => setQidOverride(e.target.value)}
            placeholder="optional"
          />
        </Field>
        <div className="sm:col-span-3">
          <SubmitButton pending={pending}>Fetch preview (no changes made)</SubmitButton>
        </div>
      </form>

      {commitMsg && (
        <p
          className={`rounded-sm border px-3 py-2 text-[0.85rem] ${
            commitMsg.startsWith("Error")
              ? "border-red-200 bg-red-50 text-danger"
              : "border-green-200 bg-green-50 text-approved"
          }`}
        >
          {commitMsg}{" "}
          {!commitMsg.startsWith("Error") && (
            <Link href="/review" className="underline">
              Open review queue →
            </Link>
          )}
        </p>
      )}

      {preview && !preview.ok && <FormError message={preview.error} />}

      {preview?.ok && (
        <div className="rounded-sm border border-rule bg-paper-raised p-4">
          <p className="text-[0.85rem] text-ink-muted">
            Matched Wikidata item:{" "}
            <a
              href={`https://www.wikidata.org/wiki/${preview.resolution.qid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              {preview.resolution.label} ({preview.resolution.qid})
            </a>
            {preview.resolution.description ? ` — ${preview.resolution.description}` : ""}. If this
            is the wrong item, use the QID override above.
          </p>

          {rows.length === 0 ? (
            <p className="mt-3 text-[0.85rem] text-ink-muted">Nothing found to import.</p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-rule">
                {rows.map((r, i) => (
                  <li key={i} className="flex items-start gap-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(i)}
                      onChange={() => toggle(i)}
                      aria-label={`Include ${r.main}`}
                    />
                    <div className="text-[0.88rem]">
                      <p className="font-medium text-ink">{r.main}</p>
                      <p className="text-[0.8rem] text-ink-faint">{r.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={runCommit}
                  disabled={pending || selected.size === 0}
                  className="rounded-sm bg-ink px-5 py-2 text-[0.88rem] font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  {pending
                    ? "Creating drafts…"
                    : `Create ${selected.size} draft${selected.size === 1 ? "" : "s"} for review`}
                </button>
                <span className="text-[0.8rem] text-ink-faint">
                  Drafts go to the review queue — nothing publishes until approved.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
