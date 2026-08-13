"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that rolls into place, one reel per digit.
 *
 * The rules it follows are the ones the removed text wave broke. It runs ONCE,
 * when the number first comes into view, and then it is over: the reels are
 * torn down and what is left in the DOM is the plain number, selectable and
 * copyable like any other text. Nothing here loops and nothing re-runs on
 * scroll, because a figure that keeps moving is a figure nobody can read.
 *
 * The value rendered on the server is the final value, so a reader with no
 * JavaScript, a crawler, or anyone who reaches the page before hydration sees
 * the true number rather than a zero waiting to be filled in. The animation is
 * an enhancement layered over a correct page, never the thing that produces
 * the figure.
 *
 * Each reel spins through two full passes and stops on its digit, and the
 * reels stop left to right.
 */

/** Two full 0-9 passes, then the digit it lands on. */
const SPIN_CELLS = 20;
const SPIN_MS = 900;
const STAGGER_MS = 90;

export function RollingNumber({
  value,
  className = "",
}: {
  /** Already formatted, separators and all. This component never does maths. */
  value: string;
  className?: string;
}) {
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded] = useState(false);
  const hostRef = useRef<HTMLSpanElement>(null);
  const spent = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || spent.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const digits = value.replace(/\D/g, "").length;
    if (digits === 0) return;
    const total = SPIN_MS + STAGGER_MS * (digits - 1) + 80;

    let raf = 0;
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (spent.current || !entries.some((e) => e.isIntersecting)) return;
        spent.current = true;
        io.disconnect();
        setRolling(true);
        // One frame parked at the top of the strip, then the transition runs.
        raf = requestAnimationFrame(() => setLanded(true));
        // Back to plain text once every reel has stopped. They have done their
        // job, and a number is easier to live with as a number.
        timer = window.setTimeout(() => setRolling(false), total);
      },
      { threshold: 0.4 },
    );
    io.observe(host);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [value]);

  if (!rolling) {
    return (
      <span ref={hostRef} className={className}>
        {value}
      </span>
    );
  }

  let reel = -1;
  return (
    <span ref={hostRef} className={className}>
      {/* The reels are a picture of the number; the number itself is read from
          the copy beside them, which no sighted reader sees. */}
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="roll">
        {[...value].map((ch, i) => {
          if (!/\d/.test(ch)) {
            return (
              <span key={i} className="roll-fixed">
                {ch}
              </span>
            );
          }
          reel += 1;
          return (
            <span key={i} className="roll-reel">
              <span
                className="roll-strip"
                style={{
                  // The landing digit is the last cell, so every reel travels
                  // the same distance and only the stagger separates them.
                  transform: landed
                    ? `translateY(-${(SPIN_CELLS / (SPIN_CELLS + 1)) * 100}%)`
                    : "translateY(0)",
                  transitionDuration: `${SPIN_MS}ms`,
                  transitionDelay: `${STAGGER_MS * reel}ms`,
                }}
              >
                {Array.from({ length: SPIN_CELLS }, (_, n) => (
                  <span key={n} className="roll-cell">
                    {n % 10}
                  </span>
                ))}
                <span className="roll-cell">{ch}</span>
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
