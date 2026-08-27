# 20 — Landing expansion + banyan seal

Additive follow-on to handoff 19. Nothing in the existing landing page is
rewritten: eight new sections, one scroll-reveal behaviour, one replaced SVG.

Approved in `Abhilekh Landing.dc.html` (design prototype).

## Page order after integration

    Hero
    → Archive features
    → WHO IT'S FOR            (new)
    → Stats
    → ASK THE ARCHIVE         (new — the question chips move in here)
    → Network                 (19)
    → Timeline                (19)
    → FEATURED COLLECTIONS    (new)
    → On this day             (19)
    → About
    → TRANSCRIBE              (new)
    → Ledger + contribute     (19)
    → PRESS & MENTIONS        (new)
    → DRAWN FROM              (new, short strip)
    → FAQ
    → Open data               (19)
    → DEVELOPER API           (new)
    → NEWSLETTER              (new)
    → CTA
    → Footer

## See it before you build it

- `preview.html` — static render of all eight new sections, each labelled with
  its insertion point. Plain HTML + the new CSS, no app code. Open it directly.
- `screenshots/00-new-sections-all.png` — the same thing as one tall image.
- `screenshots/NN-<name>-NEW.png` — one per new section, numbered to match the
  page chart in PROMPT.txt.
- `screenshots/21-seal-banyan.png` — the redrawn seal at 300 / 150 / 64 px.

## Files

| File | Exports | Kind |
| --- | --- | --- |
| AudienceSection.tsx | default, AUDIENCES | server |
| SearchDemo.tsx | default | server (renders 19's QuestionChips) |
| CollectionsSection.tsx | default, COLLECTIONS | server |
| TranscribeSection.tsx | default | server |
| PressSection.tsx | PressSection, SourcesStrip, PRESS_SLOTS, SOURCES | server |
| ApiSection.tsx | default, ENDPOINTS | server |
| NewsletterSection.tsx | default | client (form state) |
| section-reveal.ts | initSectionReveal | client util |
| SectionReveal.tsx | default | client (mount once, renders null) |
| globals-additions.css | l20/aud/sdemo/coll/tsc/press/src/api/nl namespaces | — |
| abhilekh-logo.svg | the seal, redrawn | asset |
| preview.html | static render of all eight sections | reference |
| screenshots/ | per-section PNGs + seal | reference |

## The seal changed

`abhilekh-logo.svg` replaces the file shipped in handoff 15. Two changes:

- The tree is now a **banyan (vata)**, not a peepal: eight limbs spreading to
  the inner edge of the arch, and ten aerial prop roots descending from them to
  splayed feet at ground level. Denser leaf mass, figs in place of the flower
  motif. The reading is the archive's own: cover widens, root holds.
- The Latin **ABHILEKH** wordmark and the knot rule above it are **removed**.
  अभिलेखः is the only type in the seal now.

Canvas is therefore **260 × 272**, not 260 × 300. Anything giving the seal a
fixed height needs a second look; width-only sizing is unaffected.

## Behaviour notes

- **SearchDemo** shows one real verified answer (Punjab, President's Rule
  1987). It is static by design — it demonstrates the answer *format*, including
  the source line. Do not wire it to live search without keeping the citation.
- **NewsletterSection** posts to `ACTION`, which ships empty: the form reports
  success without sending. Set it before launch.
- **PressSection** ships three empty slots on purpose. Leave them empty until
  real coverage exists.
- **section-reveal** reads `[data-page]`'s children and writes inline styles.
  It touches no component, needs no class on any section, and removes every
  style it sets once a section has arrived. Reduced motion disables it.
- **TranscribeSection** counts and **ApiSection** endpoints/rate limit are
  design placeholders. Both are flagged in the source.

## Design tokens used

Same set as 19 — ink #1a1a18 · muted #71716c/#8a8a84/#9c9c96 · hairline #f1f1ee
card #f6f6f4 · scan #e3e2dc/#c8c6bc · saffron #c2410c · blue #0369a1
serif Newsreader 300 · mono IBM Plex Mono · radii 24/20/12 · section gap 16px
