# Floor plans to indoor graphs (#16)

Code: `pipeline/floorplans/` (`triage.ts` -> `run.ts` -> `report.ts`; `geo.ts` is the georeferencing). Run from the repo root with `~/.hermes/.env` sourced.

1. Download the URLs in `data/research/floorplans.jsonl` to `data/raw/floorplans/dl/NN.bin` (plus 2 library handbooks found by web search).
2. `triage.ts` renders PDFs to PNG (70 dpi) and asks Gemini (`agy/gemini-3.8-flash-medium`, via OmniRoute, cached) to classify every page: floor plan, site map, evacuation route, other. 482 pages triaged.
3. `run.ts` (plans listed in `plans.json`): Gemini returns the outer wall outline, doors (exterior, public, step-free, confidence), links (corridor/lobby/bridge/stairs/lift, path, walk seconds) and hours. The outline is fitted to OSM building outlines with a similarity transform from every corner pair; a fit is accepted only when the mean outline error is at most 3 m (max 8 m), the size matches, and the pose is unambiguous (a symmetric outline that fits 180 degrees apart is rejected). Exterior doors must then lie within 6 m of the OSM outline. Only public doors and links with Gemini confidence of at least 0.7 that join two public exterior doors are written, to `data/overrides/indoor/<plan>.geojson` and as `through-building` candidates with `floor-plan` evidence. Hours not on the plan default to Mon-Fri 08:00-18:00 with `assumed: true`.
4. `report.ts` writes `data/raw/reports/floorplans.html` (coverage map and table).

## Result: no indoor graph was emitted

Of 482 pages, only 5 are real floor plans. The rest are campus or area maps (FKE, FKM, KTC, UTMSPACE), text, or photos.

| Building | Plan found | Outcome |
|---|---|---|
| N29A, UTM-MPRC Institute for Oil & Gas (ground floor) | `FIRE-ESCAPE-PLAN-GF.png` | rejected: ambiguous pose, even when limited to the one OSM outline that fits the first-floor plan |
| N29A first floor | `FIRE-ESCAPE-PLAN-L1-2026-SHARED-scaled.png` | outline fits OSM `w207274658` (mean 1.3 m, max 4.2 m), but N29A has no name in OSM so the match is unconfirmed, and the level has no exterior doors, only stairs inside the institute. Nothing written |
| Akademi Bahasa D05/D06 | emergency-plan PDF, pages 5-6 | rejected: schematic strip with no closed wall outline that fits; ambiguous pose. D06 has no OSM name |
| UTM Eco-Home | thesis CAD plan | not used: a research house, not a public building |
| FKE P-blocks, FKM, KTC, UTMSPACE T05/T06/T08, Kolej Dato Onn (KDOJ drill report, 26 pages), Faculty of Science | site maps or text only | no floor plan |
| Perpustakaan Sultanah Zanariah, Dewan Sultan Iskandar, Masjid Sultan Ismail, Canselori, N28, Arked areas | none found | web search and the two UTM library handbooks (164 pages) have no floor plans |

A wrong indoor link is worse than none, so the router is unchanged: `npm run build:graph` reports `doors 0, indoor links 0`, golden trips baseline untouched. Nothing to compare before/after.

## To get real coverage

Floor plans for the main buildings are not online. They need the UTM Estate Office (Pejabat Harta Bina) or photos taken on site. Drop images in `data/raw/floorplans/png/`, add them to `plans.json` (search centre and radius, or `osmIds`), and run `run.ts`. The pipeline writes the overrides if the georeference and the door checks pass.
