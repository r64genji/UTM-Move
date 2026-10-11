# UTM Move v2 — Rewrite Plan

Status: plan only. Nothing here is built yet. Written 2026-10-09.

## Goal

Keep navigation. Rewrite it so it is more capable, robust, and useful.
Run everything in the user's browser. No backend. No GraphHopper at runtime.

## Can the browser do it alone? Yes.

Measured on 2026-10-09:

| Thing | Size | Browser cost |
|---|---|---|
| Bus stops | 57 | trivial |
| Bus routes | 11 (26 trip patterns, 554 departures/day pattern) | trivial |
| OSM walk network in UTM bbox | 1,944 ways, 9,562 nodes, ~2,625 junctions | Dijkstra < 10 ms |
| Walk graph as binary file | est. < 200 KB raw, < 80 KB gzip | one download, cached offline |

GraphHopper is not needed. The data is tiny. A Web Worker (a background
thread in the browser) can do the full trip search in milliseconds.

The real risk is data quality, not speed:

- OSM has only 277 footways and 13 steps in the area. Most mapped ways are roads.
  So walk routes will follow roads and miss campus shortcuts.
- OSM has 0 building entrances mapped. So routes end at a building centre, not a door.
- UTM is hilly. A flat distance cost will pick steep routes.

Fix: a small hand-made overlay (shortcuts, covered walkways, entrances), plus
an elevation cost per edge. See Phase 3.

## Architecture

```
BUILD TIME (your machine / CI)                 RUN TIME (browser only)
─────────────────────────────                  ─────────────────────────
gosom (Google Maps scrape) ─┐                  App (React)
OSM .pbf extract ───────────┼─► pipeline ─►    ├─ Map (MapLibre + PMTiles)
data/transit/*.yaml ────────┤   validate       ├─ Search (offline index)
data/overrides/* ───────────┘   emit static    ├─ useUserLocation()
                                files          └─ Router Web Worker
                                  │                 ├─ walk graph (Dijkstra)
                                  └─► public/data   └─ transit (RAPTOR)
```

### Build-time pipeline (`pipeline/`)

1. **Places from gosom.**
   - Lay a grid of points over the UTM polygon (about every 300 m).
   - Run one gosom job per point with `-geo lat,lon -radius 400 -zoom 18`.
   - Use a keyword list for campus things: fakulti, kolej, dewan, blok, makmal,
     perpustakaan, surau, masjid, kafe, kafeteria, ATM, bank, klinik, pejabat,
     stadium, gelanggang, parking, hostel, etc. Add the English words too.
   - Use the patched gosom image (port 8086) so fast mode keeps `category`.
   - Reuse the client from `agency-wt/.../scripts/leads/lib/gosom.mjs`
     (submit → poll → CSV → rows).
   - Keep raw CSV in `data/raw/gosom/` (gitignored).
2. **Buildings and paths from OSM.**
   - Cut the UTM area from `malaysia-singapore-brunei-latest.osm.pbf`.
   - OSM gives 3,797 building outlines (660 named, 166 with a ref/code).
   - Join: each gosom point → the OSM building it sits in. The building gets
     the name, aliases, category, and block code.
3. **Clean and merge places.**
   - Keep only points inside the UTM polygon.
   - Merge duplicates: same `place_id`, or similar name within 25 m.
   - Drop junk: "Unnamed …", bins, permanently closed.
   - Apply `data/overrides/places.yaml`: aliases (KTHO, KTDI, N28a, …),
     hide list, pin fixes, display names.
4. **Transit.**
   - `data/transit/*.yaml` is the one hand-edited source, typed from the PDF.
   - Pipeline turns it into a GTFS-like model: stops, routes, trips with a
     time at **every** stop (from measured segment times), calendars.
   - Calendars cover weekday/Friday/weekend, the Friday prayer gap, and
     semester-break and public-holiday exceptions.
5. **Walk graph.**
   - OSM walkable ways + `data/overrides/walk-links.geojson` (shortcuts,
     covered walkways) + `data/overrides/entrances.geojson`.
   - Remove ways people cannot walk (motorway, trunk, construction).
   - Add an elevation cost per edge (SRTM or the existing elevation data).
   - Simplify to junctions. Emit as typed arrays (compact binary).
6. **Validate (CI fails if any check fails).**
   - Every stop ID in trips exists. No unused stops.
   - Every stop and place is inside the polygon (`V01` fails today).
   - Every stop and every place entrance can reach the walk graph.
   - Trip times go up along each trip.
   - No "Unnamed" place names. No duplicate IDs.
7. **Emit** into `public/data/<hash>/`: `places.json`, `transit.json`,
   `walk-graph.bin`, `search-index.json`, `campus.pmtiles`.
8. **Coverage report.** The pipeline writes an HTML map of all places and all
   walk edges, so you can check by eye.

### Run time (browser)

**Router worker** (`src/workers/router.worker.ts`):

1. Snap origin and destination to the walk graph (spatial index: kdbush).
2. Dijkstra from the origin → walk time to every stop (cap ~15 min).
3. Reverse Dijkstra from the destination → walk time from every stop.
4. RAPTOR (a fast timetable search) over the transit data, up to 2 transfers.
5. Keep the best options by arrival time, walking, and transfers.
   Always include the walk-only option.
6. Return up to 3 options. Each leg already has its cut geometry.
   The UI only draws. No geometry stitching in the UI.

Supports: depart now, depart at, arrive by, avoid stairs, walk speed.

**Walking instructions.** Most campus footways have no name. So instructions
use angles plus landmarks: "Turn left after FKE Block P05".

**Live navigation mode.**

- Follow GPS. Show the next step and the distance to it.
- Off-route check (more than ~30 m off for ~10 s) → re-plan in the worker.
- Bus warnings: "Bus leaves in 4 min. You need 6 min to walk."

**`useUserLocation()`** — one hook, one shape `{ lat, lon, accuracy }`.

| Status | UI |
|---|---|
| `idle` | "Use my location" button. Do not ask on load. |
| `asking` | spinner |
| `ok` | blue dot + accuracy circle |
| `denied` | how to turn it on + "pick on map" |
| `unavailable` / `timeout` | retry + "pick on map" |
| `off-campus` | "You are not at UTM" + pick a start point |
| `low-accuracy` (> 100 m) | show it, warn, let the user drag the pin |

**Time.** Use `Asia/Kuala_Lumpur` for every schedule calculation.
Never trust the device time zone.

**Search.** Offline index (MiniSearch). Names, aliases, block codes, Malay and
English words, typo tolerance.

**Other features.**

- Departure board per stop.
- Route view with live "next bus" countdown.
- Saved places (home, faculty).
- Shareable links: URL holds the trip.
- Feedback: keep the Google Form. Prefill the place ID or route ID.

**Offline (PWA).** Precache the app, all `public/data`, and `campus.pmtiles`.
This replaces `precacheTiles.js`, which breaks the OSM tile rules.

## Tech stack

| Need | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript + Vite | keep what works; TS stops the `lat/lon/lng` bugs |
| Map | MapLibre GL + PMTiles | self-hosted campus tiles, offline, allowed |
| Routing | React Router | real URLs, shareable trips |
| State | Zustand (small) + URL state | no prop chains, no `window` events |
| Worker calls | Comlink | simple async calls into the worker |
| Search | MiniSearch | small, offline, fuzzy |
| Spatial index | kdbush | fast nearest-node lookup |
| Data checks | zod | one schema for pipeline and app |
| Pipeline run | tsx + pyosmium (OSM read) | already works on this machine |
| Tests | Vitest + Playwright (1 smoke test) | |
| CI | GitHub Actions: lint, typecheck, test, validate data, build | |
| Hosting | Vercel static | already in use |

Removed: Express, axios, GraphHopper, Leaflet, localStorage data cache,
desktop/mobile split.

## Repo layout

One package. No monorepo.

```
src/
  domain/        pure TS, no React, all unit-tested
    geo/  transit/  walk/  router/  search/  time/
  features/
    map/  plan-trip/  navigate/  stops/  routes/  places/  location/
  ui/            shared components
  workers/router.worker.ts
pipeline/
  sources/gosom.ts  sources/osm.py  sources/transit.ts
  build.ts  validate.ts  report.ts
data/
  transit/*.yaml
  overrides/places.yaml  walk-links.geojson  entrances.geojson
  campus-boundary.geojson
  raw/            (gitignored)
public/data/      (generated, gitignored, built in CI)
tests/e2e/
```

## Phases

Each phase ends with a check you can see.

0. **Freeze.** Tag current `main` as `v1`. Start branch `v2`. Do not carry over
   the junk files, `Backend/`, or the `.bat` scripts.
1. **Transit data.** Port `schedule.json` + `route_durations.json` to YAML.
   Build per-stop times. Validate.
   Check: departure board for CP matches the PDF for 3 sample times.
2. **Places.** gosom grid scrape + OSM join + overrides.
   Check: coverage report map. 0 unnamed. You spot-check 20 places.
3. **Walk graph.** OSM + overlay + elevation.
   Check: connectivity report. You walk 5 real routes and compare.
4. **Router.** Worker + golden tests. Port the useful cases from the 86 old
   tests (KTGB→FKT, U5→FKT, G17→FKT, …) as fixtures.
   Check: golden tests pass. Each query < 50 ms on a mid phone.
5. **UI.** One responsive app. Location hook. Trip planner. Navigation mode.
   Check: Playwright smoke test plans a trip with a mocked GPS.
6. **Offline + deploy.** PWA, PMTiles, Vercel preview.
   Check: airplane mode still plans a trip.
7. **Cutover.** Point the domain to v2. Delete `Backend/` and old branches.

## Risks

- **Google terms.** Scraping Google Maps and publishing that data in a public
  app breaks Google's terms. Your lead projects use it internally, which is
  lower risk. Lower it here: use gosom only to discover names and categories.
  Keep raw scrapes out of git. Ship your own curated list.
- **OSM licence (ODbL).** Shipping data built from OSM needs "© OpenStreetMap
  contributors" attribution, and the derived database must stay open.
- **gosom host.** On 2026-10-09 neither `100.107.31.27:8085` nor
  `localhost:8086` answered from this machine. Start it before Phase 2.
- **OSM footpath gaps.** Best long-term fix: add the missing campus paths and
  entrances to OSM itself. Then everyone benefits, and the overlay stays small.
- **No live bus positions.** v2 uses the timetable only. Say so in the UI.
