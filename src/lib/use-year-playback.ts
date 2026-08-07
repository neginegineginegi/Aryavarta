"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Democracy Replay: the year scrubber, driven.
 *
 * Ported from the living-map prototype. The prototype used setInterval at
 * 520ms/speed, which drifts under load and fires a render even when the tab
 * is backgrounded; this drives off requestAnimationFrame against a real
 * timestamp instead, so a step is a step regardless of frame rate and the
 * loop parks itself when the tab is hidden.
 *
 * Playback is not decoration, so prefers-reduced-motion does not disable it.
 * A reader who has asked for less movement still gets to watch the record
 * advance; what they lose is the easing around it, which globals.css handles.
 */

const STEP_MS = 520;
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export type Playback = {
  year: number;
  playing: boolean;
  speed: Speed;
  loop: boolean;
  setYear: (y: number) => void;
  toggle: () => void;
  stop: () => void;
  cycleSpeed: () => void;
  toggleLoop: () => void;
  /** Jump to the next marker after the current year, wrapping to the first. */
  skipTo: (markerYears: number[]) => void;
};

export function useYearPlayback({
  min,
  max,
  initial,
  onYearChange,
}: {
  min: number;
  max: number;
  initial: number;
  /** Called on every year change, including each playback step. */
  onYearChange?: (y: number) => void;
}): Playback {
  const [year, setYearState] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [loop, setLoop] = useState(false);

  // The callback is held in a ref so a caller passing a fresh closure each
  // render never restarts playback. Assigned in an effect, not during render.
  const onChange = useRef(onYearChange);
  useEffect(() => {
    onChange.current = onYearChange;
  }, [onYearChange]);

  // One notification point for every year change, whoever caused it: the
  // slider, a keypress, or a playback step. Driving it from an effect rather
  // than from each mutation site matters, because a setState updater runs in
  // the render phase, and a caller that syncs the URL there would be mutating
  // the router mid-render.
  const notified = useRef(initial);
  useEffect(() => {
    if (notified.current === year) return;
    notified.current = year;
    onChange.current?.(year);
  }, [year]);

  const setYear = useCallback(
    (y: number) => setYearState(Math.min(max, Math.max(min, y))),
    [min, max],
  );

  const stop = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // Pressing play at the end rewinds, so the button never looks inert.
    if (year >= max) setYear(min);
    setPlaying(true);
  }, [playing, year, max, min, setYear]);

  const cycleSpeed = useCallback(
    () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]),
    [],
  );

  const toggleLoop = useCallback(() => setLoop((l) => !l), []);

  const skipTo = useCallback(
    (markerYears: number[]) => {
      if (markerYears.length === 0) return;
      const next = markerYears.find((y) => y > year);
      setYear(next ?? markerYears[0]);
    },
    [year, setYear],
  );

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const interval = STEP_MS / speed;

    const tick = (now: number) => {
      // A backgrounded tab can hand back a gap of many seconds. Advancing one
      // year per elapsed interval would then fast-forward decades on return,
      // so a step is capped at one year per frame.
      if (now - last >= interval) {
        last = now;
        let ended = false;
        setYearState((y) => {
          if (y < max) return y + 1;
          if (loop) return min;
          ended = true;
          return y;
        });
        if (ended) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, loop, min, max]);

  return {
    year,
    playing,
    speed,
    loop,
    setYear,
    toggle,
    stop,
    cycleSpeed,
    toggleLoop,
    skipTo,
  };
}
