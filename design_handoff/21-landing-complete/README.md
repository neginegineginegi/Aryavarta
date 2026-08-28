# 21 — Landing, complete (supersedes handoffs 19 + 20)

Handoff 19 never reached the repository, so this folder re-delivers everything:
19's six sections + 20's eight, reconciled into one package against the page
that actually ships today (HERO, MAP, FEATURES, STATS, ABOUT, FAQ, CTA).

What "reconciled" means:
- every component is a **named export** (20's defaults converted)
- SearchDemo imports `{ QuestionChips }` correctly
- one merged `globals-additions.css` (19's `lsec/pm/otd/ledger/odata/qchips`
  namespaces + 20's `l20/aud/sdemo/coll/tsc/press/src/api/nl`), single
  reduced-motion block at the end
- the page chart accounts for the repo's MAP band and missing footer band
- the fragment problem is solved with a `display: contents` wrapper —
  zero layout impact, gives the reveal script an element to read

## See it before you build it
- `preview.html` — every new section, statically rendered, in page order,
  labelled with its insertion point. The network canvas can't render
  statically; its shell carries a note instead.
- `screenshots/00-all-new-sections.png` — the whole thing as one image
- `screenshots/NN-*.png` — one per band, numbered to match the chart
- `screenshots/21-seal-banyan.png` — the redrawn seal at 300/150/64 px

## Files
| File | Exports | Kind |
| --- | --- | --- |
| components/UnionNetwork.tsx | NetworkSection, UnionNetwork | client |
| components/PmTimeline.tsx | TimelineSection | client |
| components/OnThisDay.tsx | OnThisDaySection | server |
| components/LedgerSection.tsx | LedgerSection | server |
| components/OpenDataSection.tsx | OpenDataSection | server |
| components/QuestionChips.tsx | QuestionChips | server |
| components/AudienceSection.tsx | AudienceSection, AUDIENCES | server |
| components/SearchDemo.tsx | SearchDemo | server |
| components/CollectionsSection.tsx | CollectionsSection, COLLECTIONS | server |
| components/TranscribeSection.tsx | TranscribeSection | server |
| components/PressSection.tsx | PressSection, SourcesStrip | server |
| components/ApiSection.tsx | ApiSection, ENDPOINTS | server |
| components/NewsletterSection.tsx | NewsletterSection | client |
| components/SectionReveal.tsx | SectionReveal | client, renders null |
| components/section-reveal.ts | initSectionReveal | client util |
| globals-additions.css | both handoffs' CSS, merged | — |
| abhilekh-logo.svg | banyan seal, 260×272, no Latin wordmark | asset |
| preview.html / screenshots/ | the target | reference |

## Placeholders that must not ship as facts
- network "records since" years — validate against the database
- ledger feed rows, transcribe counts, API endpoints + rate limit
- press slots stay empty until real coverage exists
- newsletter ACTION is empty: the form fakes success until wired

## The seal changed (repeat of handoff 20's note)
Banyan (vata) with aerial prop roots instead of the peepal; Latin ABHILEKH
wordmark and knot rule removed — अभिलेखः is the only type. Canvas 260×272
(was 260×300): fixed-height usages need their numbers updated.
