"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that reflects its form's pending state: disabled, dimmed,
 * and relabeled while the server action runs. Drop-in child for any
 * server-component <form action={...}>.
 */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} ${pending ? "cursor-wait opacity-50" : ""}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
