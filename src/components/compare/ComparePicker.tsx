"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { inputClass } from "@/components/forms/fields";
import type { ElectionIndexEntry } from "@/lib/db/queries/compare";
import { yearOf } from "@/lib/format";

function Side({
  label,
  index,
  value,
  onChange,
}: {
  label: string;
  index: ElectionIndexEntry[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = index.find((e) => e.id === value);
  const [stateId, setStateId] = useState(selected?.stateId ?? "");

  const states = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of index) if (!seen.has(e.stateId)) seen.set(e.stateId, e.stateName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [index]);

  const options = index.filter((e) => e.stateId === stateId);

  return (
    <div className="flex-1 space-y-2">
      <p className="section-label">{label}</p>
      <select
        className={inputClass}
        value={stateId}
        onChange={(e) => {
          setStateId(e.target.value);
          onChange("");
        }}
        aria-label={`${label}: state`}
      >
        <option value="">Select state / union…</option>
        {states.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!stateId}
        aria-label={`${label}: election`}
      >
        <option value="">Select election…</option>
        {options.map((e) => (
          <option key={e.id} value={e.id}>
            {yearOf(e.electionDate)} — {e.scope === "lok_sabha" ? "Lok Sabha" : "Assembly"}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ComparePicker({
  index,
  initialA,
  initialB,
}: {
  index: ElectionIndexEntry[];
  initialA?: string;
  initialB?: string;
}) {
  const router = useRouter();
  const [a, setA] = useState(initialA ?? "");
  const [b, setB] = useState(initialB ?? "");

  return (
    <div className="rounded-sm border border-rule bg-paper-raised p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Side label="Compare" index={index} value={a} onChange={setA} />
        <span className="hidden pb-2 font-display text-xl text-ink-faint sm:block">vs</span>
        <Side label="With" index={index} value={b} onChange={setB} />
        <button
          type="button"
          disabled={!a || !b || a === b}
          onClick={() => router.push(`/compare?a=${a}&b=${b}`)}
          className="rounded-sm bg-ink px-5 py-2 text-[0.88rem] font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          Compare
        </button>
      </div>
      {index.length === 0 && (
        <p className="mt-3 text-[0.82rem] text-ink-muted">
          No elections in the archive yet — comparisons appear once elections are approved.
        </p>
      )}
    </div>
  );
}
