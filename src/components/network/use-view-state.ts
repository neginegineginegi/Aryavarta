"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { DEFAULT_VIEW, decodeView, encodeView, type NetworkView } from "@/lib/funding/view-state";

/**
 * The URL as the only copy of the view state.
 *
 * The obvious shape for this is `useState` plus an effect that reads the URL on
 * mount and another that writes it on change. That is two copies of one fact,
 * and it misbehaves in both directions: the writer races the reader on first
 * paint and can overwrite a pasted link with the defaults, and the back button
 * moves the address bar without moving the diagram.
 *
 * So there is one copy, and it lives in the address bar. `useSyncExternalStore`
 * is what React provides for exactly this: an external source of truth that can
 * change outside React. The server snapshot is the default view, which is what
 * the server can honestly say, and the client reads the real search string
 * after hydration without a mismatch.
 *
 * `getSnapshot` must return the same object when nothing has changed, or React
 * re-renders forever. Hence the cache keyed on the search string.
 */

let cachedSearch: string | null = null;
let cachedView: NetworkView = DEFAULT_VIEW;

function snapshot(): NetworkView {
  const search = window.location.search;
  if (search !== cachedSearch) {
    cachedSearch = search;
    cachedView = decodeView(new URLSearchParams(search));
  }
  return cachedView;
}

/** Stable across calls, which the server snapshot has to be. */
function serverSnapshot(): NetworkView {
  return DEFAULT_VIEW;
}

const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Back and forward move the address bar, so they have to move the diagram.
  window.addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", fn);
  };
}

export function useViewState(): [NetworkView, (patch: Partial<NetworkView>) => void] {
  const view = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const set = useCallback((patch: Partial<NetworkView>) => {
    const current = decodeView(new URLSearchParams(window.location.search));
    const params = encodeView(
      { ...current, ...patch },
      new URLSearchParams(window.location.search),
    );
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next === window.location.pathname + window.location.search) return;
    // replaceState, not pushState: dragging the year slider would otherwise put
    // a history entry under every tick, and the back button would walk the
    // reader through the drag one frame at a time. Next documents its History
    // API integration, so the router stays in step.
    window.history.replaceState(null, "", next);
    for (const fn of listeners) fn();
  }, []);

  return [view, set];
}

/** The open set as a Set, memoised so the graph's own memos do not all
 *  invalidate on every unrelated view change. */
export function useOpenSet(open: string[]): Set<string> {
  const key = open.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the value of `open`
  return useMemo(() => new Set(open), [key]);
}
