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

## Batch 4, obtained 2026-08-08

Same transform, extended: `scripts/one-off/extract-gem-power-2026.py`. Three
more generating technologies complete the Energy band; all are CC BY 4.0 with
no non-commercial upstream.

| File | SHA-256 | Verdict |
| --- | --- | --- |
| GlobalHydropowerTrackerMarch2026.xlsx (1,837,746 B) | 89193c207e1e5c5da5a264a08bd01f9578d68f066503d0f2f260db0dd9ec4088 | Ingested: cumulative operating hydropower capacity, 1922 to 2025, by state and for India. 224 operating India projects, every one carrying both a commissioning year and a state. One project crosses into Nepal; only the India-side capacity the file itself splits out is counted. Conventional storage, run-of-river and pumped storage are summed together and the methodology says pumped storage is a store rather than a source. |
| GlobalNuclearPowerTrackerSeptember2025.xlsx (446,154 B) | 4d4bfe9dccc2df5270addd5f7a29d8ea5ca2f9591dd095b013cbe5011a9cc1d8 | Ingested: cumulative operating nuclear capacity, 1981 to 2025, by state and for India. Cleanest file received: 21 of 21 operating units dated and located, no threshold, no retirements. Gross nameplate capacity, not the design-net or reference-net columns beside it. |
| GlobalOilandGasPlantTrackerGOGPTJanuary2026.xlsx (3,248,102 B) | d64dc73be3e87e8857dc366148509684fcd12e980c33d15dd4dbed217a0d769c | Ingested: cumulative operating gas and oil fired power capacity, 1989 to 2025, by state and for India. 91 of 100 operating units dated (97.0 per cent of capacity); the nine undated carry the sentinel `not found`, a third spelling after empty and `unknown`. One retired India unit exists and the methodology reports it rather than claiming none. |
| GlobalIronOreMinesTrackerAugust2025V1.xlsx (202,831 B) | f5a14aa5cbb6c4d3cc3584451b9102d95564588a58c40a472dc7745cf5c63cd4 | Ingested as a SNAPSHOT only: iron ore mine design capacity by state, 220 operating mines, 500,862 ttpa. Two refusals recorded in the methodology itself: design capacity is a present-day rating so it cannot be laid on a commissioning axis, and the 2022/2023/2024 production columns are reported by 181, 167 and 130 mines respectively, so a three-point series would show the reporting count falling and read as production falling. |
| GlobalOilandGasExtractionTrackerMarch2026.xlsx (5,393,993 B) | 10ed7bc007e47895c2f387449365c20d0a87679cb8c69be678d0cc60df4d1aa5 | Not ingested: 19 India fields, of which 15 have a blank subnational unit (11 are offshore and have no state by nature). The production sheet holds 14 rows across 7 fields in mixed units (million m3/y and million bbl/y) with data years scattered from 2011 to 2024, so neither a state series nor a national total can be built from it. |

**The nameplate test.** Hydro and nuclear passed on Global Energy Monitor's own
column definition, which calls the figure "nameplate capacity", the design
rating fixed at commissioning. The iron workbooks name theirs "Current
capacity", a present-day rating, and are snapshots for that reason. Read the
About sheet's definition before deciding whether a file can become a series;
do not infer it from the numbers.

## Batch 5, obtained 2026-08-08

Same transform, extended: `scripts/one-off/extract-gem-power-2026.py`. Coal was
the last generating technology missing from the Energy band, and it is by far
the largest.

| File | SHA-256 | Verdict |
| --- | --- | --- |
| Global_Integrated_Power_August_2026.xlsx (28,785,579 B) | 8a5b3c361b195cbe1cb1430d42e6f557f765e528d4ccbe4574c0e0edd1c4a421 | Ingested, COAL AND BIOENERGY ONLY. 182,592 rows covering every technology in one sheet; the other five come from their dedicated trackers so each series cites the release it was built from. That split was checked, not assumed: this file reports 679 operating Indian wind units at 38,937 MW and 21 nuclear units at 8,240 MW, matching the dedicated trackers exactly. Coal is a series (862 operating units, 254,433 MW, 100.0 per cent of capacity dated, 22 states, none missing, 1965 to 2026). Bioenergy is a snapshot: only 58.6 per cent of its capacity carries a commissioning year. |
| Global_Coal_Mine_Tracker_May_2026.xlsx (2,649,198 B) | 8a51bb5b82c73ef9745696e58d9c53f9aa1c92b6f5e6f8fcfe3781bc4213a80a | Ingested as a SNAPSHOT: coal mine capacity by state, 349 operating mines, 1,388 mtpa, 12 states, none missing. Supersedes batch 3's refusal of the methane tracker's coal mines, which carried only coordinates. No series: capacity is a present-day rating and only 57.3 per cent of mines record an opening year. Production is not published either, because each figure carries its own year of production rather than a common one. |
| GeothermalPowerTrackerMarch2026Final.xlsx (180,369 B) | 27576c580dc53697ea4e11e8ce00378a7877ac37c6c47a820ea4f13bacb54a00 | Not ingested: **zero India rows**. India has no tracked geothermal generation. |
| GlobalBioenergyPowerTrackerGBPTV3.xlsx (1,152,083 B) | 4799a4dae94addf2f5b96e8eb4beb5f2ca7683659fd262020c5f3a1f9ad45590 | Not ingested directly: it holds the same 158 Indian units as the integrated tracker but names a state for only 19 of them against 149. The integrated file is used instead, for the same data with the geography filled in. |
| GEMGOITOilNGLPipelines202606.xlsx (573,063 B) | 48423b71e77e172d6598f022961b074835a0f80ed909e3b9c06d8c6618825cb0 | Not ingested: 24 Indian rows, and a pipeline is linear infrastructure with a start state and an end state rather than a location. Summing segment capacities would also double-count where segments overlap on one route. |

Where two files carry the same asset, prefer the one whose geography is
complete, and say which was used. Two of this batch's five are duplicates or
empties rather than new data.
