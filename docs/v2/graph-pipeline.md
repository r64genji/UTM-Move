# Graph pipeline (`npm run build:graph`)

`pipeline/graph/build.ts` builds `public/data/graph.bin` (format: `graph-format.md`) from committed inputs only, so CI needs no `.pbf`.

| Input | Source | Notes |
|---|---|---|
| `data/osm/walk-ways.geojson` | `npx tsx pipeline/graph/extract.ts` from `data/raw/osm/ways.geojson` | walkable ways only, already classified (`kind`, `sheltered`, `stepFree`, `grade`, `name`), 6-decimal coords |
| `data/osm/dem-grid.json` | same script, from Copernicus GLO-30 (`data/raw/dem/*.tif`) | 30 m grid, int16 decimetres |
| `data/osm/landmarks.json` | same script, named buildings | names junctions within 40 m |
| `data/transit/stops.yaml` | | every stop gets a node |
| `public/data/places.json` | places build | `entrances[]` get nodes; skipped with a warning if missing |
| `data/shortcuts/scored.geojson` | `npm run score:shortcuts` | `verified` and `likely` only; `private` access dropped; stairs become `steps` |
| `data/overrides/indoor/*.geojson` | #16 | `Point` = door (kind `door`, joined to the nearest path within 40 m); `LineString` = indoor link (kind `indoor`, or `properties.kind`), ends snap to the network within 20 m. Properties: `name`, `hours` (OpeningHours), `stepFree` (default true) |

Steps: ways to junction-to-junction edges, doors/indoor/shortcuts snapped in (edges are split), keep the largest connected component (islands are listed and drawn red in `data/raw/reports/graph.html`), connect stops and entrances with short connector edges, then climb per edge: DEM sampled every 10 m, 3-point smoothing, wobble under 0.5 m ignored, net height change always kept. Bridges and tunnels interpolate between their ends. Geometry is simplified to 0.7 m.

Stop V01 (Taman Universiti) is outside the OSM extract, so it joins through a long connector (warned in the build output).
