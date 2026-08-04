import type { ReactNode } from "react";

const VARIANT_CLASSES = {
  neutral: "bg-paper-sunken text-ink-muted border-rule",
  type: "bg-paper-sunken text-ink border-rule-dark",
  disputed: "bg-amber-50 text-disputed border-amber-300",
  pending: "bg-paper-sunken text-ink-muted border-rule-dark border-dashed",
  approved: "bg-green-50 text-approved border-green-200",
  rejected: "bg-red-50 text-danger border-red-200",
  import: "bg-blue-50 text-accent border-blue-200",
} as const;

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: keyof typeof VARIANT_CLASSES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-sm border px-1.5 py-px text-[0.7rem] font-medium leading-relaxed ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
