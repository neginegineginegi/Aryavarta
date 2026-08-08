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

## Batch 3, obtained 2026-08-08

Transform for the four ingested datasets:
`scripts/one-off/extract-gem-power-2026.py`. The solar and wind trackers are
the India power data the pipeline in docs/DEVELOPMENT_DATA.md was designed for,
and they produce the archive's first multi-year indicator series.

| File | SHA-256 | Verdict |
| --- | --- | --- |
| GlobalSolarPowerTrackerFebruary2026.xlsx (16,516,689 B) | 99f44fd162faff436cbc7c1edf7a8a486c4e32746a9786778362ca4688d39959 | Ingested: cumulative operating utility-scale solar capacity, 2011 to 2025, by state and for India. Strongest file received so far: 4,467 India rows, every one carrying a state, and 93.4 percent of operating capacity carrying a commissioning year. Mixed AC and DC capacity ratings are summed as published and disclosed, never converted. |
| GlobalWindPowerTrackerFebruary2026.xlsx (4,955,207 B) | 5d828a1b5d9a2b862aa009c23639e05fb2b3e0ad14baf0c8c9b83cc115a43210 | Ingested: cumulative operating wind capacity, 1990 to 2025, by state and for India. Coverage is partial at 69.5 percent of operating capacity, published because the undated share is spread across states (18 to 52 percent) rather than concentrated in the oldest, so the curve's shape survives while its level undercounts. The methodology says so in capitals. |
| Iron_unit_data_Global_Iron_and_Steel_Tracker_June_2026_V1.xlsx (397,828 B) | a770dddb8ddc6475eccb32d9b54981f5f81a53253b097adb8715c193e9f73f6a | Ingested as SNAPSHOTS only: blast furnace and direct reduced iron capacity, by state and for India. Neither sheet carries a state; state joins from the plant-level workbook on GEM plant ID for every India unit. A year-by-year series was built and withdrawn: capacity is a present-day rating, the oldest operating blast furnace dates from 1919, and all 80 dated operating units carry a recorded relining, so a cumulative series would have put a 2018 rating on a 1919 axis. |
| LNGCarrierTrackerDecember2025release.xlsx (320,004 B) | 8c97426939c826232b1444958c0f0b68b2caa9297fe04b0c054c198d1c0612de | Not ingested: 1,143 vessels, zero Indian shipowners and zero Indian shipbuilding yards. Vessels carry no state geography in any case. |
| GMET_V3_12122025.xlsx (3,592,904 B) | 8a05b177ab29f534600637b6868ae50238565cdde545dfc111f07fe47046a006 | Not ingested: Global Methane Emissions Tracker. India rows in all six data sheets (543 coal mines, 72 extraction areas, 71 pipelines, 36 LNG terminals, 22 plumes, 9 reserves) but NO sheet carries an Indian subnational unit and no sheet carries an opening or commissioning year, so nothing can be placed on either axis the archive needs. Coal mines hold only latitude and longitude; resolving them to states needs a boundary file this project does not have. "Coal Output (Annual, Mst)" is empty for every India row, and the one well-populated numeric column is GEM's own modelled methane estimate. |

Sentinel warning for future releases: the iron unit workbook writes the literal
string `unknown` in date cells that the solar and wind trackers leave empty.
Treating that as a value counted every row as carrying a retired date. Check
each new file for its own sentinel before trusting any coverage number.
