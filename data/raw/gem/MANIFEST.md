# Raw dataset manifest: Global Iron and Steel Tracker

Raw files are NOT committed (data/raw/ is gitignored except this manifest).
Recoverability: fetch the same release from Global Energy Monitor and verify
the checksum below.

| Field | Value |
| --- | --- |
| File | Steel_unit_data_Global_Iron_and_Steel_Tracker_June_2026_V1.xlsx |
| Size | 489,109 bytes |
| SHA-256 | d5355acd307930c0104d21dc9c6e6d62451856e044ce1aa3c576d9cb14b4d425 |
| Dataset | Global Iron and Steel Tracker, June 2026 (V1) release |
| Publisher | Global Energy Monitor |
| URL | https://globalenergymonitor.org/projects/global-iron-and-steel-tracker/ |
| License | Creative Commons Attribution 4.0 International |
| Obtained | 2026-08-08 |
| Transform | scripts/one-off/extract-gem-gist-2026.py |

A new GEM release is new data: rerun the transform, bump the values (the
loader inserts on conflict-do-nothing keyed by indicator, state and year, so
same-year corrections need a manual update), and update this manifest.
