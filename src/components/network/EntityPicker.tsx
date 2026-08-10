"use client";

import { useEffect, useId, useRef, useState } from "react";

import { searchEntitiesAction } from "@/actions/network-connect";
import type { NodeHit } from "@/lib/db/queries/network";
import { NODE_TYPE_LABELS, ORG_KIND_LABELS } from "@/lib/funding/labels";

/**
 * Type a name, pick an entity.
 *
 * Search-first rather than a list of everything, which is the rule that keeps
 * this usable as the dataset grows, and which also stops the interface handing
 * a reader a browsable catalogue of organisations to draw conclusions about
 * before they have read a single source.
 */
export function EntityPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: NodeHit | null;
  onChange: (hit: NodeHit | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<NodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);

  const q = query.trim();
  // Derived, not stored: a query too short to search shows nothing, and
  // clearing state from inside the effect to achieve that only causes a second
  // render to say what this line already says.
  const shown = q.length >= 2 ? hits : [];

  useEffect(() => {
    if (q.length < 2) return;
    // Debounced, and every in-flight result is discarded if a newer keystroke
    // has happened: without that the list flickers back to an older query.
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchEntitiesAction(q);
      if (!live) return;
      setHits(res);
      setLoading(false);
      setOpen(true);
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  if (value) {
    return (
      <div className="net-pick">
        <span className="net-pick-label">{label}</span>
        <div className="net-pick-chosen">
          <span>
            <strong>{value.label}</strong>
            <span className="net-pick-meta">
              {value.type === "org" && value.subKind
                ? (ORG_KIND_LABELS[value.subKind] ?? NODE_TYPE_LABELS.org)
                : (NODE_TYPE_LABELS[value.type] ?? value.type)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
              setHits([]);
            }}
            aria-label={`Clear ${label}`}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="net-pick" ref={box}>
      <label className="net-pick-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="search"
        className="net-pick-input"
        autoComplete="off"
        placeholder="Type at least two letters"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => shown.length > 0 && setOpen(true)}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
      />
      {open && (
        <ul className="net-pick-list" id={`${id}-list`} role="listbox">
          {loading && <li className="net-pick-note">Searching…</li>}
          {!loading && shown.length === 0 && (
            <li className="net-pick-note">Nothing recorded under that name.</li>
          )}
          {shown.map((h) => (
            <li key={`${h.type}:${h.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange(h);
                  setOpen(false);
                }}
              >
                <span>{h.label}</span>
                <span className="net-pick-meta">
                  {h.type === "org" && h.subKind
                    ? (ORG_KIND_LABELS[h.subKind] ?? NODE_TYPE_LABELS.org)
                    : (NODE_TYPE_LABELS[h.type] ?? h.type)}
                  {" · "}
                  {h.degree} {h.degree === 1 ? "relationship" : "relationships"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
