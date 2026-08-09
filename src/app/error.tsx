"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ErrorState } from "@/components/ui/States";

/**
 * The root error boundary.
 *
 * It says what failed and offers the two things that actually help: retry the
 * render, or go somewhere that works. It does not apologise at length, and it
 * does not show a stack trace to a reader who came here to look up who
 * governed Kerala in 1996.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side digest only; the message itself may carry query internals.
    console.error("Page render failed", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-4">
      <section className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <h1 className="font-display text-[clamp(28px,3.6vw,40px)] font-light leading-[1.08] text-ink">
          This page could not be loaded
        </h1>
        <ErrorState
          message="Something went wrong while assembling this record."
          helper="The archive itself is unaffected. Trying again usually resolves it; if it does not, the record may be mid-revision."
          onRetry={reset}
        >
          <p className="mt-5 border-t border-rule pt-3 text-[0.78rem] text-ink-faint">
            <Link href="/" className="text-accent underline-offset-2 hover:underline">
              Back to the map
            </Link>
            {error.digest ? (
              <span className="ml-3 font-mono text-[10px] tracking-[0.06em] text-ink-meta">
                Ref {error.digest}
              </span>
            ) : null}
          </p>
        </ErrorState>
      </section>
    </div>
  );
}
