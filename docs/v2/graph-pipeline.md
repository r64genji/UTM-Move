# Graph pipeline (`npm run build:graph`)

`pipeline/graph/build.ts` builds `public/data/graph.bin` (format: `graph-format.md`) from committed inputs only, so CI needs no `.pbf`.

| Input | Source | Notes |
|---|---|---|
| `data/osm/walk-ways.geojson` | `npx tsx pipeline/graph/extract.ts` from `data/raw/osm/ways.geojson` | walkable ways only, already classified (`kind`, `sheltered`, `stepFree`, `grade`, `name`), 6-decimal coords |
| `data/osm/dem-grid.json` | same script, from Copernicus GLO-30 (`data/raw/dem/*.tif`) | 30 m grid, int16 decimetres |
| `data/osm/obstacles.geojson` | `uv run --with osmium python pipeline/graph/extract-obstacles.py` (needs the `.pbf`) | building and water outlines within ~80 m of a walkable way; only used so a gap connector never crosses one |
| `data/osm/landmarks.json` | same script, named buildings | names junctions within 40 m |
| `data/transit/stops.yaml` | | every stop gets a node |
| `public/data/places.json` | places build | `entrances[]` get nodes; skipped with a warning if missing |
| `data/shortcuts/scored.geojson` | `npm run score:shortcuts` | `verified` and `likely` only; `private` access dropped; stairs become `steps` |
| `data/overrides/indoor/*.geojson` | #16 | `Point` = door (kind `door`, joined to the nearest path within 40 m); `LineString` = indoor link (kind `indoor`, or `properties.kind`), ends snap to the network within 20 m. Properties: `name`, `hours` (OpeningHours), `stepFree` (default true) |

Steps: ways to junction-to-junction edges, then **gap closing**, then doors/indoor/shortcuts snapped in (edges are split), keep the largest connected component (islands are listed and drawn red in `data/raw/reports/graph.html`), connect stops and entrances with short connector edges, then climb per edge: DEM sampled every 10 m, 3-point smoothing, wobble under 0.5 m ignored, net height change always kept. Bridges and tunnels interpolate between their ends. Geometry is simplified to 0.7 m.

Stop V01 (Taman Universiti) is outside the OSM extract, so it joins through a long connector (warned in the build output).

Gap closing (`kind: connector`, drawn magenta in the report, count printed as `gaps closed`): OSM mappers often leave a way ending a few metres short of the way it should join. A dangling end (a node only one edge uses) is joined to the nearest point of another way when that is within 12 m, or within 18 m when it is another dangling end (two ends facing each other). It is skipped when the other way is already within 60 m of walking from the end (a spur next to its own junction), or when the link would cross a building or water outline. Any other way in between would be nearer, so it cannot be crossed. Current data: 89 gaps closed, 0.6 to 17.9 m, 74 under 10 m. The longest ones (12 to 18 m, 14 of them) are mostly road to road or road to footway ends; look at them in the report when the map changes. Connectors count as ordinary stair-free walkable edges.
