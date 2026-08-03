"use client";

import type { ReactNode } from "react";

export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.8rem] font-medium text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {hint && !error ? <span className="mt-1 block text-[0.75rem] text-ink-faint">{hint}</span> : null}
      {error ? <span className="mt-1 block text-[0.78rem] text-danger">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.88rem] text-ink outline-none transition-colors focus:border-accent disabled:bg-paper-sunken disabled:text-ink-muted";

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[0.85rem] text-danger">
      {message}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-ink px-5 py-2 text-[0.88rem] font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
    >
      {pending ? "Submitting…" : children}
    </button>
  );
}
