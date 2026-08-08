# 17 · Living background

Everything the landing page gained after the cursor field: the tricolor bands became canvases that react to the pointer, the scroll and taps; type ripples when you scroll; FAQ rows light under the cursor.

This builds on what's already in the repo — `src/lib/cursor-field.ts`, `.cx-char`, `.cx-glow`, the nav panels. Nothing here replaces that.

## Files

| File | Goes to | What it is |
| --- | --- | --- |
| `living-field.ts` | `src/lib/living-field.ts` | The engine: energy, phase, ripples, canvas ribbons, the page-wash lean, the row lamp. |
| `TricolorRibbon.tsx` | `src/components/ui/TricolorRibbon.tsx` | `<TricolorRibbon variant="wide" />` — replaces one `.prism` div. |
| `AutoLetters.tsx` | `src/components/ui/AutoLetters.tsx` | Mounted once, makes every line of type on the page cursor-reactive. |
| `globals-additions.css` | append to `src/app/globals.css` | `.ribbon-*` geometry and `.lamp-row`. Goes after `.prism`, **before** the reduced-motion block at the end. |

## The prompt for Claude Code

```
Read design_handoff/17-living-background/README.md and the three source files
beside it. The cursor field from handoff 16 is already in this repo — build on
it, don't replace it.

1. Copy living-field.ts to src/lib/, TricolorRibbon.tsx and AutoLetters.tsx to
   src/components/ui/. Append globals-additions.css to src/app/globals.css,
   placed after the .prism rules and BEFORE the final prefers-reduced-motion
   block (that block must stay last).

2. Replace each decorative prism div with the canvas component:
     src/app/page.tsx:100   <div aria-hidden className="prism prism-wide" />    -> <TricolorRibbon variant="wide" />
     src/app/page.tsx:101   <div aria-hidden className="prism prism-sharp" />   -> <TricolorRibbon variant="sharp" />
     src/app/page.tsx:314   <div aria-hidden className="prism prism-soft" />    -> <TricolorRibbon variant="soft" />
     src/app/page.tsx:356   <div aria-hidden className="prism prism-reverse" /> -> <TricolorRibbon variant="reverse" />
     src/app/about/page.tsx:16  <div aria-hidden className="prism prism-soft" /> -> <TricolorRibbon variant="soft" />
   Confirm the line numbers still match before editing; find them by class if not.
   page.tsx is a server component, so the parent section stays server-rendered —
   TricolorRibbon carries its own "use client".

3. Give the FAQ a ribbon and a lamp. Find the FAQ section in src/app/page.tsx:
   make its card `relative`, add <TricolorRibbon variant="faq" /> as its first
   child, and on each question's clickable row add `data-lamp` and the
   `lamp-row` class, removing whatever flat hover background it has now.

4. Patch the scroll wave into the existing cursor field. In src/lib/cursor-field.ts:
     - import { fieldEnergy, fieldTime } from "@/lib/living-field";
     - in the per-character loop, after the proximity value `v` is computed, add a
       wave term driven by the character's index i within its group:
         const wave = Math.min(1, fieldEnergy() * 0.5) * 2.6;
         const ripple = wave > 0.02 ? Math.sin(i * 0.42 + fieldTime() * 2.4 + g.seed) * wave : 0;
       and add `ripple` to the px the character is translated by. Give each group
       a stable `seed` (its index at registration time) if it does not have one.
     - keep the loop alive while `fieldEnergy() > 0.002`, or the wave stops mid-scroll.

5. Mount <AutoLetters /> once in src/app/layout.tsx, inside <body> after <Header />.
   Read its comments first: it splits text in the DOM and re-heals after React
   re-renders. If you would rather be explicit, skip it and wrap headings in the
   existing <CursorText> instead — but then only wrapped text reacts.

Verify in a browser:
  - all five ribbons paint (canvas is not blank) and wave when you scroll
  - clicking anywhere sends a visible ripple along the nearest band
  - FAQ rows light under the cursor and still toggle open
  - type lifts near the cursor and ripples while scrolling
  - with prefers-reduced-motion: reduce, every band is still visible but static,
    no letter moves, and no lamp lights
  - with JavaScript disabled, the bands still show their CSS gradient
  - document.body.scrollWidth === documentElement.clientWidth at 320 and 1440
```

## How it works

**One number does most of the work.** `energy` starts at 0. Scrolling adds in proportion to distance moved, pointer movement adds a little, a tap adds 0.9. Every frame it decays exponentially (`energy *= exp(-dt * 2.6)`, roughly halving each quarter second). Wave height and drift speed both scale off it, which is why the page swells when you act and settles when you stop — and why interrupting never looks wrong. Nothing is a fixed-duration animation.

**`phase` is pushed directly by scroll** (`phase += dy * 0.005`), so the crest physically travels through the band as the page moves rather than merely wobbling faster.

**Ribbons are drawn, not filtered.** For each column across the canvas the engine computes a centreline — three sine waves at different wavelengths, plus a Gaussian bell around the cursor that bends and thickens the band locally, plus any live ripples — then fills the outline with the saffron-to-green gradient. The CSS `blur()` still does the softening, so the bands look identical at rest.

**Taps are real expanding rings.** A tap stores its x and an age; each frame the crest moves outward at 820px/s while the amplitude decays. Touch goes through the same path, so swipes and taps behave the same on a phone.

**Cost control.** Blurred canvases render at 40% resolution (nothing is visible through a 42px blur), the loop pauses for bands scrolled out of view, all five bands share one loop, and reduced motion draws a single still frame with no listeners bound at all.

## Things that will bite

**React owns the text.** `AutoLetters` mutates the DOM; any component that re-renders its own text throws the letter spans away. The MutationObserver re-heal is what makes it survivable, and it is why the observer must not react to its own writes (the `busy` flag). If you see letters vanish from one section only, that section is re-rendering more often than the heal — wrap it in `<CursorText>` instead.

**अभिलेखः is never split**, and neither is any string containing Devanagari. The letters combine into conjuncts and per-character spans break the script. The wordmark gets scale-on-hover and magnetic drift instead.

**Prose is skipped over 420 characters**, and body text only lifts and tints — never weight. Changing weight changes word widths, which re-breaks lines under the cursor.

**Ribbon canvases need headroom.** A canvas can only draw inside itself, so every `.ribbon-*` box is taller than the `.prism-*` it shadows and sits higher up to compensate. Change one and you must change both numbers together, or the wave clips flat at the top.

**Values from the prototype:** `--ribbon-opacity: 0.8` and the letter/wave amplitude at 0.8 of the values in this code — those are what the design settled on after tuning. The CSS ships at 0.8; if the waves feel too strong, scale `A` in `draw()` rather than the opacity.

## Reference implementation

`Abhilekh Landing.dc.html` in the project root, with `waveMotion` and `interactive` exposed as tweaks so you can feel the range before committing to numbers.
