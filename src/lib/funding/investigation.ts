/**
 * A researcher's working state for one network: notes, pins, and flags.
 *
 * Stored in the browser and nowhere else. Three reasons, and the first is the
 * important one.
 *
 * The graph has no write path into the archive, and an investigation must not
 * become one. A note is a researcher's own reasoning: unreviewed, uncited, and
 * frequently wrong on the way to being right. If it were stored beside the
 * record it would eventually be read as part of it.
 *
 * It also means no account is needed to start working, and that a half-formed
 * investigation about named organisations never leaves the machine it was
 * typed on.
 *
 * The cost is real and the interface says so: this does not follow you to
 * another browser, and clearing site data clears it. Carrying an investigation
 * between devices needs a table, an owner and a deliberate decision about who
 * can read it, which is a different piece of work.
 */

export type Investigation = {
  version: 1;
  rootKey: string;
  /** Keyed by 'org:uuid' for entities and by edge id for relationships. */
  notes: Record<string, string>;
  /** Positions the researcher dragged a node to, so the arrangement survives. */
  pins: Record<string, { x: number; y: number }>;
  /** Marked as needing a source, or as worth returning to. */
  flags: Record<string, "needs_source" | "follow_up">;
  updatedAt: string;
};

const PREFIX = "abhilekh:investigation:";
/** Same-tab writes do not fire `storage`, so they announce themselves. */
const LOCAL_EVENT = "abhilekh:investigation-changed";

export function emptyInvestigation(rootKey: string, now: string): Investigation {
  return { version: 1, rootKey, notes: {}, pins: {}, flags: {}, updatedAt: now };
}

/**
 * Parse defensively. This is data from a previous version of the code that a
 * user may not have loaded in months, so anything unrecognised is dropped
 * rather than trusted, and a corrupt entry loses the investigation instead of
 * breaking the page it belongs to.
 */
export function parseInvestigation(raw: string | null, rootKey: string): Investigation | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Investigation>;
    if (v?.version !== 1 || v.rootKey !== rootKey) return null;
    const strings = (o: unknown): Record<string, string> =>
      Object.fromEntries(
        Object.entries((o ?? {}) as Record<string, unknown>).filter(
          ([, x]) => typeof x === "string",
        ),
      ) as Record<string, string>;
    const pins = Object.fromEntries(
      Object.entries((v.pins ?? {}) as Record<string, unknown>).filter(
        ([, p]) =>
          typeof p === "object" &&
          p !== null &&
          Number.isFinite((p as { x: unknown }).x) &&
          Number.isFinite((p as { y: unknown }).y),
      ),
    ) as Investigation["pins"];
    const flags = Object.fromEntries(
      Object.entries(strings(v.flags)).filter(
        ([, f]) => f === "needs_source" || f === "follow_up",
      ),
    ) as Investigation["flags"];
    return {
      version: 1,
      rootKey,
      notes: strings(v.notes),
      pins,
      flags,
      updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "",
    };
  } catch {
    return null;
  }
}

/** Nothing is written for an investigation with nothing in it, so a visit that
 *  only looked around leaves no trace. */
export function isEmpty(inv: Investigation): boolean {
  return (
    Object.keys(inv.notes).length === 0 &&
    Object.keys(inv.pins).length === 0 &&
    Object.keys(inv.flags).length === 0
  );
}

export function storageKey(rootKey: string): string {
  return PREFIX + rootKey;
}

export function load(rootKey: string): Investigation | null {
  if (typeof window === "undefined") return null;
  try {
    return parseInvestigation(window.localStorage.getItem(storageKey(rootKey)), rootKey);
  } catch {
    return null;
  }
}

export function save(inv: Investigation): void {
  if (typeof window === "undefined") return;
  try {
    if (isEmpty(inv)) window.localStorage.removeItem(storageKey(inv.rootKey));
    else window.localStorage.setItem(storageKey(inv.rootKey), JSON.stringify(inv));
  } catch {
    // A full or disabled store must not take the graph down with it.
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/**
 * `useSyncExternalStore` plumbing.
 *
 * The browser store is exactly what that hook is for, and reading it this way
 * rather than copying it into component state removes a whole class of
 * problem: no effect that sets state on mount, no stale copy after a write, and
 * two tabs open on the same investigation stay in step for free.
 *
 * The snapshot is cached against the raw string. `getSnapshot` must return the
 * same reference until the underlying data actually changes, and parsing afresh
 * every call would hand React a new object every time and spin.
 */
let cachedRaw: string | null = null;
let cachedKey = "";
let cachedValue: Investigation | null = null;

export function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

export function snapshot(rootKey: string): Investigation | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(rootKey));
  } catch {
    return null;
  }
  if (raw === cachedRaw && rootKey === cachedKey) return cachedValue;
  cachedRaw = raw;
  cachedKey = rootKey;
  cachedValue = parseInvestigation(raw, rootKey);
  return cachedValue;
}

/** Nothing is known before hydration, which is also the honest answer. */
export function serverSnapshot(): Investigation | null {
  return null;
}

export function clear(rootKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(rootKey));
  } catch {
    /* nothing to do */
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

export function countEntries(inv: Investigation): number {
  return (
    Object.keys(inv.notes).length +
    Object.keys(inv.pins).length +
    Object.keys(inv.flags).length
  );
}
