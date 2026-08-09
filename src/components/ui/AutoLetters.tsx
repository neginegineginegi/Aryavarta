"use client";

import { useEffect } from "react";

import { registerChars } from "@/lib/cursor-field";

/**
 * Makes every line of type on the page cursor-reactive, without wrapping 200
 * strings in <CursorText>.
 *
 * Mount ONCE, in the root layout. It walks the DOM, splits leaf text into
 * per-word / per-letter spans, and registers each block with the cursor field.
 * A MutationObserver re-heals anything React re-renders — that is the whole
 * difficulty of this feature: React owns the text, and when it rewrites a line
 * the injected spans go with it.
 *
 * <CursorText> is still the right tool for a heading you want to be certain
 * about (it splits at render time, so the server and client markup match).
 * This is the blanket.
 */

/** Longer than this is prose, not a headline: leave it alone. */
const MAX = 420;
const TAGS = "h1,h2,h3,p,a,span,strong,li,div";

export function AutoLetters({ root = "body" }: { root?: string }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = document.querySelector(root);
    if (!host) return;

    const cleanups: (() => void)[] = [];
    let busy = false;
    let queued = 0;

    const split = (el: Element) => {
      const walk = (node: Node) => {
        for (const n of Array.from(node.childNodes)) {
          if (n.nodeType === 3) {
            if (!n.textContent?.trim()) continue;
            const frag = document.createDocumentFragment();
            for (const tok of n.textContent.split(/(\s+)/)) {
              if (!tok) continue;
              if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); continue; }
              const w = document.createElement("span");
              w.className = "cx-word";
              for (const ch of tok) {
                const s = document.createElement("span");
                s.className = "cx-char";
                s.dataset.cxChar = "";
                s.textContent = ch;
                w.appendChild(s);
              }
              frag.appendChild(w);
            }
            node.replaceChild(frag, n);
          } else if (n.nodeType === 1 && (n as Element).className !== "cx-word") {
            walk(n);
          }
        }
      };
      walk(el);
    };

    const scan = () => {
      busy = true;
      for (const el of Array.from(host.querySelectorAll<HTMLElement>(TAGS))) {
        if (el.dataset.auto) continue;
        const owner = el.closest<HTMLElement>("[data-auto]");
        if (owner && owner !== el) continue;                 // inside a split subtree
        let hasText = false;
        for (const n of Array.from(el.childNodes)) {
          if (n.nodeType === 3 && n.textContent?.trim()) { hasText = true; break; }
        }
        if (!hasText) continue;
        const raw = el.textContent || "";
        // Devanagari letters combine into conjuncts: splitting them breaks the script.
        if (/[\u0900-\u097F]/.test(raw)) { el.dataset.auto = "skip"; continue; }
        if (raw.length > MAX) { el.dataset.auto = "skip"; continue; }
        const cs = getComputedStyle(el);
        // A flex or grid container with a gap puts that gap between EVERY
        // child, and split words are children. `.btn` is inline-flex with an
        // 8px gap, so "Explore the map" gained 8px between each word on top
        // of the space already there and read as letterspaced mono. Leave any
        // gapped container's own text alone.
        if ((cs.display.includes("flex") || cs.display.includes("grid")) && parseFloat(cs.gap) > 0) {
          el.dataset.auto = "skip";
          continue;
        }
        const size = parseFloat(cs.fontSize) || 14;
        // Weight only where a width change cannot re-break a line.
        const mode = size >= 24 ? "chars" : "ink";
        split(el);
        el.dataset.auto = "1";
        el.dataset.cx = mode;
        cleanups.push(registerChars(el, mode));
      }
      busy = false;
    };

    const heal = () => {
      queued = 0;
      for (const el of Array.from(host.querySelectorAll<HTMLElement>('[data-auto="1"]'))) {
        if (!el.querySelector(".cx-char")) delete el.dataset.auto;   // React rewrote it
      }
      scan();
    };

    const mo = new MutationObserver(() => {
      if (busy || queued) return;
      queued = requestAnimationFrame(heal);
    });

    // Start AFTER hydration, not on mount. This app streams, so a root effect
    // fires while React is still claiming later chunks; splitting text it has
    // not hydrated yet made every route throw "server rendered HTML didn't
    // match the client", which then de-opts that tree to client rendering.
    //
    // Rather than guess a delay, wait for the DOM to go QUIET: hydration is a
    // burst of childList work, so once nothing has been added or removed for
    // a beat, React is done. Self-tuning, with a hard cap so a page that
    // never settles still gets its letters. Attribute mutations are excluded
    // deliberately, or the cursor field writing inline styles would hold the
    // page "busy" forever. Behaviour is unchanged, only its start.
    let cancelled = false;
    let settleTimer = 0;
    let capTimer = 0;
    let settleObserver: MutationObserver | null = null;

    const begin = () => {
      if (cancelled) return;
      cancelled = false;
      settleObserver?.disconnect();
      settleObserver = null;
      clearTimeout(settleTimer);
      clearTimeout(capTimer);
      scan();
      mo.observe(host, { childList: true, subtree: true, characterData: true });
    };

    const waitForQuiet = () => {
      if (cancelled) return;
      const bump = () => {
        clearTimeout(settleTimer);
        settleTimer = window.setTimeout(begin, 250);
      };
      settleObserver = new MutationObserver(bump);
      settleObserver.observe(host, { childList: true, subtree: true });
      bump();
      capTimer = window.setTimeout(begin, 4000);
    };

    if (document.readyState === "complete") waitForQuiet();
    else window.addEventListener("load", waitForQuiet, { once: true });

    return () => {
      cancelled = true;
      settleObserver?.disconnect();
      clearTimeout(settleTimer);
      clearTimeout(capTimer);
      mo.disconnect();
      if (queued) cancelAnimationFrame(queued);
      for (const c of cleanups) c();
    };
  }, [root]);

  return null;
}
