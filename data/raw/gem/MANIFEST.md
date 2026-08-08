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

## Batch 2, obtained 2026-08-08

Transform for the three ingested files:
`scripts/one-off/extract-gem-industry-2026.py`.

| File | SHA-256 | Verdict |
| --- | --- | --- |
| Plantlevel_data_Global_Iron_and_Steel_Tracker_June_2026_V1.xlsx (735,833 B) | a5768b59cd7e6cec217692ae45eda80ea70aab1666aef74332cc1b41dd5338eb | Ingested: nominal crude steel capacity of operating plants, by state and for India. Its 2019 to 2024 production sheet covers roughly 63 percent of India's reported crude steel output and is NOT published. |
| Plantlevel_data__Global_Cement_and_Concrete_Tracker__July_2026__Standard_Copy_V1.xlsx (1,445,945 B) | 3fc861ebd0be8f6e980b5bff6c05f28472f7b82f9f31f78d7fb98127938a33fb | Ingested: operating cement capacity, by state and for India. The 2024-25 production column covers only 15 Indian plants and is not published. |
| ProductionConsumptionofMetCoalIronOrebySteelIndustryDecember2025StandardCopyV1.xlsx (22,821 B) | 399b9ce88985b3bcc6642ad32950e345387c9c5e78c7597d9d63155fde613f2f | Ingested: four national values (met coal mined, iron ore mined, pig iron produced, DRI produced). The consumption columns are factor-based estimates and are not published. |
| Plantlevel_data__Global_Chemicals_Inventory__November_2025_V2.xlsx (163,006 B) | 3e70cbf189b8d175b46515fa9960a9aa0ece21dd9d8481633184fa845ce1b6bd | Not ingested: no numeric fields; products and feedstock text only. |
| Portal_Energetico_tracker_202608.xlsx (6,565,939 B) | e5a51b89d1a825c9f2239d468b321f6d25d0c6491b3c007ed65086afa44dd672 | Not ingested: Latin America energy portal, zero India rows across all technology sheets. Its column shape (Capacity MW, Status, Start year, Retired year per technology) is the schema family expected of the pending India power dataset. |
