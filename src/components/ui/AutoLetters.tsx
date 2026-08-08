"use client";

import { useEffect } from "react";

import { registerChars } from "@/lib/cursor-field";

/**
 * Makes headings on the page cursor-reactive without wrapping each one by
 * hand. Mounted once, in the layout.
 *
 * React owns this text. Any component that re-renders its own heading throws
 * these spans away, which is what the MutationObserver re-heal is for, and why
 * the observer must ignore its own writes (the `busy` flag). If letters vanish
 * from one section only, that section re-renders faster than the heal can keep
 * up: wrap it in <CursorText> instead and add data-no-letters to it here.
 *
 * Everything it touches is registered in "ink" mode, which lifts and tints and
 * changes NO advance widths. That is not timidity, it is the handoff's own two
 * rules meeting: mono labels have no variable weight axis to interpolate, and
 * headings here wrap, so a weight change would re-break the line under the
 * pointer. Weight gain stays available through an explicit <CursorText
 * mode="chars"> wherever a human has confirmed the line cannot wrap.
 */

/** Display type only. Never tables, never form controls, never prose blocks. */
const SELECTOR = [
  "h1",
  "h2",
  "h3",
  ".display-1",
  ".display-2",
  ".display-3",
  ".eyebrow",
  ".curator-label",
].join(",");

/** Conjuncts break when split per character, so Devanagari is left alone. */
const DEVANAGARI = /[ऀ-ॿ]/;
const MAX_CHARS = 420;

function eligible(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.dataset.cx || el.closest("[data-no-letters]")) return false;
  if (el.closest("input,textarea,select,svg,[contenteditable]")) return false;
  const text = el.textContent ?? "";
  if (!text.trim() || text.length > MAX_CHARS || DEVANAGARI.test(text)) return false;
  // Only elements whose content is plain text (line breaks allowed). Anything
  // with nested markup keeps its own structure rather than being rebuilt.
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (node.nodeName === "BR") continue;
    return false;
  }
  return true;
}

function split(el: HTMLElement) {
  const original = el.textContent ?? "";
  const frag = document.createDocumentFragment();

  // One accessible copy of the real string. The letters are hidden from
  // assistive tech so a heading is never spelled out a glyph at a time.
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = original;
  frag.appendChild(sr);

  const visible = document.createElement("span");
  visible.setAttribute("aria-hidden", "true");
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeName === "BR") {
      visible.appendChild(document.createElement("br"));
      continue;
    }
    for (const part of (node.textContent ?? "").split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        visible.appendChild(document.createTextNode(part));
        continue;
      }
      const word = document.createElement("span");
      word.className = "cx-word";
      for (const ch of Array.from(part)) {
        const c = document.createElement("span");
        c.className = "cx-char";
        c.textContent = ch;
        word.appendChild(c);
      }
      visible.appendChild(word);
    }
  }
  frag.appendChild(visible);

  el.replaceChildren(frag);
  el.dataset.cx = "ink";
}

export function AutoLetters() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const stops: Array<() => void> = [];
    let busy = false;
    let queued = 0;

    const scan = () => {
      queued = 0;
      busy = true;
      try {
        for (const el of Array.from(document.querySelectorAll(SELECTOR))) {
          if (!eligible(el)) continue;
          split(el);
          stops.push(registerChars(el, "ink"));
        }
      } finally {
        // Released on the next task so the observer never sees its own writes.
        setTimeout(() => {
          busy = false;
        }, 0);
      }
    };

    scan();

    const observer = new MutationObserver(() => {
      if (busy || queued) return;
      queued = window.setTimeout(scan, 180);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      clearTimeout(queued);
      stops.forEach((s) => s());
    };
  }, []);

  return null;
}
