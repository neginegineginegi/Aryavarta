# Electoral bonds: source and provenance

Assembled 3 September 2026. Read this before the data.

## The provenance chain, stated plainly

    Election Commission of India  (primary source, PDF)
              |
              v
    community transcription on GitHub  (intermediary, THIS is what we hold)
              |
              v
    Abhilekh

**We do not hold the primary source.** We hold a community transcription of ECI
PDFs. That distinction is not pedantry here: the transcription has measurable
defects, catalogued in FINDINGS.md, including 1,680 rows worth about ₹623 crore
where the purchaser name is empty.

Every row ingested from this must record the ECI as its source and the
transcription as an intermediary. A reader must be able to see that no person at
Abhilekh has compared these rows to the ECI originals.

## The underlying event

On 15 February 2024 the Supreme Court struck down the Electoral Bond Scheme and
ordered disclosure. The State Bank of India supplied the records; the Election
Commission published them on 21 March 2024, including the alphanumeric bond
numbers that allow a purchase to be matched to the party that encashed it.

Primary source: https://www.eci.gov.in/disclosure-of-electoral-bonds

## What we cloned

| Repo | Commit | Cloned |
| --- | --- | --- |
| `saisantoshv3/electoral_bonds` | `aa8b9e02` (2024-05-14) | 2026-09-03 |
| `apoorv74/electoral-bonds-sbi` | `ed8b39be` (2024-03-16) | 2026-09-03 |

The first supplies the matched purchaser-to-party file. The second is held as an
independent transcription for cross-checking, not for ingest.

## Why two transcriptions matter

Both repositories independently transcribe the same ECI purchaser table and both
produce **exactly 18,871 rows**. Their distinct-name counts differ only slightly
(1,317 against 1,320), and every difference examined is whitespace: `AGARWAL M
BISHAN` against `AGARWAL  M BISHAN`.

That is strong corroboration at row level, and it isolates the real problem to
entity-name normalisation, which neither transcriber resolved authoritatively and
which Abhilekh must therefore decide for itself, in the open, as data.

This is also, incidentally, a live instance of §24 of the frontier charter: two
citations, one evidence lineage. Both repositories descend from the same ECI
PDFs. Counting them as independent support would overstate what is known.

## Licence and terms

ECI disclosure data is a public record published under Supreme Court direction.
The transcriptions carry their own repository licences, which must be read before
redistribution; a transcription is a work even where the underlying facts are
public. Neither repository was consulted for permission, and neither has been
contacted about errors found.

Unlike TCPD, no non-commercial restriction is known to apply, so this data does
not carry the CC BY-SA conflict recorded for D1/D2/D3. Confirm each repository's
licence file before the bulk export ships.

## Recommended handling

1. Ingest via the **bulk-provenance path**, never the revision queue. 20,551 rows
   is not a review queue.
2. Record the dataset with the ECI as source and the transcription as
   intermediary, carrying the repo URL, the commit hash above, and the clone date.
3. Set `evidence_status` to `documented`, never `verified`. Nothing here has been
   checked against an ECI original by anyone at Abhilekh.
4. Open an `open_questions` entry for the 1,680 unattributed rows, and a second
   for the sample verification against ECI PDFs that has not been done.
