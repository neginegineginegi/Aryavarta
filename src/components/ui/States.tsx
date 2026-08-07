import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The three states every list and table in the archive can be in, from the
 * shared-shell handoff: loading, empty, and failed.
 *
 * They share one shape on purpose. A reader who has learned that a plain
 * sentence plus a helper line plus one action means "nothing here" should not
 * have to relearn it when the reason changes from "no records yet" to "this
 * block did not load".
 */

/**
 * Skeleton rows at a table's real row height.
 *
 * The widths vary because real rows do; a stack of identical full-width bars
 * reads as a loading graphic rather than as the table that is coming. No
 * spinners inside tables, per the handoff.
 */
export function SkeletonRows({
  rows = 6,
  height = 13,
  className = "",
}: {
  rows?: number;
  height?: number;
  className?: string;
}) {
  // Fixed, not random: a server render and its hydration must agree, and a
  // skeleton that reshuffles on hydration is a visible flicker.
  const widths = [92, 78, 85, 70, 88, 74, 81, 65];
  return (
    <div className={`flex flex-col gap-2.5 ${className}`} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height, width: `${widths[i % widths.length]}%` }}
        />
      ))}
    </div>
  );
}

/** A loading block that announces itself to assistive tech, not just to eyes. */
export function LoadingBlock({
  label,
  rows = 6,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <SkeletonRows rows={rows} />
    </div>
  );
}

/**
 * The page-level loading shell: a title block and a body block, both at the
 * real card geometry, so the layout that arrives is the layout that was
 * already on screen and nothing jumps when the data lands.
 *
 * One of these serves every route through the root loading boundary rather
 * than a tailored skeleton per page. A skeleton's job is to hold the shape,
 * and fourteen near-identical files holding the same shape is upkeep with no
 * reader on the other end of it.
 */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-4" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <div className="skeleton h-3 w-32" />
        <div className="skeleton mt-5 h-10 w-[min(420px,70%)]" />
        <div className="skeleton mt-4 h-3 w-56" />
      </div>
      <div className="section-card px-6 py-9 sm:px-10">
        <div className="skeleton h-7 w-48" />
        <SkeletonRows rows={8} className="mt-6" />
      </div>
    </div>
  );
}

/**
 * Nothing here yet. One plain sentence, one helper line, and at most one
 * action: if there is no useful thing for the reader to do, the component
 * says so and stops rather than inventing a button.
 */
export function EmptyState({
  message,
  helper,
  action,
}: {
  message: string;
  helper?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="py-2">
      <p className="text-[14px] text-ink-muted">{message}</p>
      {helper && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-faint">{helper}</p>}
      {action && (
        <Link href={action.href} className="btn btn-secondary btn-sm mt-3.5">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * A block that failed. Same shape as EmptyState with a mono accent label, so
 * the difference between "nothing to show" and "something broke" is legible
 * at a glance instead of both reading as absence.
 *
 * The rest of the page stays usable: this renders inside the failed section,
 * never in place of the whole route.
 */
export function ErrorState({
  message = "This section could not be loaded.",
  helper = "The rest of the page is unaffected. Trying again usually resolves it.",
  onRetry,
  children,
}: {
  message?: string;
  helper?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="py-2">
      <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-accent">Error</p>
      <p className="text-[14px] text-ink-muted">{message}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-faint">{helper}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm mt-3.5">
          Try again
        </button>
      )}
      {children}
    </div>
  );
}
