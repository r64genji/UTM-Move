# OSM extract (#8)

`pipeline/graph/osm_extract.py` cuts the UTM campus out of the Geofabrik
Malaysia/Singapore/Brunei `.pbf` and writes GeoJSON to `data/raw/osm/`
(gitignored).

```sh
OSM_PBF=/opt/osrm/anythinglah/malaysia-singapore-brunei-latest.osm.pbf \
  uv run --with osmium --with shapely python pipeline/graph/osm_extract.py
```

`OSM_PBF` defaults to the path above. Run it from the repo root. It takes
about 5 minutes and about 1 GB of RAM, because it reads the whole country file
with node locations.

## Cut

The cut is the polygon in `data/campus-boundary.geojson`, buffered by 200 m.
A feature is kept when any part of it touches the buffered polygon. Every
feature has `inside_campus`. For ways and buildings, this is true when the
feature touches the unbuffered polygon. For points, the point must be inside it.

## Files

All files are GeoJSON `FeatureCollection`s with WGS84 `[lon, lat]`
coordinates. `osm_id` is `n<id>`, `w<id>`, or `r<id>` (node, way, relation).

| File | Geometry | What |
|---|---|---|
| `buildings.geojson` | Polygon / MultiPolygon | every `building=*` (not `no`), closed ways and multipolygon relations |
| `ways.geojson` | LineString | walkable ways (see below) |
| `entrances.geojson` | Point | nodes with `entrance=*` or `door=*` |
| `pois.geojson` | Point | nodes with a `name`, or a POI key (`amenity`, `shop`, `leisure`, `tourism`, `office`, `craft`, `healthcare`, `sport`, `public_transport`, `railway`, `emergency`, `historic`, `man_made`, `club`), or `highway=bus_stop` |
| `areas.geojson` | Polygon / MultiPolygon | named non-building areas (fields, courts, car parks, lakes, parks, plazas) |

### `buildings.geojson` properties

`osm_id`, `inside_campus`, `center` (`[lon, lat]`, a point inside the polygon)
and these tags when set: `name`, `name:en`, `name:ms`, `alt_name`,
`short_name`, `official_name`, `ref`, `addr:housenumber`, `building`,
`building:levels`, `amenity`, `operator`, `access`, `layer`.

On this campus, the block code (N28a, M46, T05) is almost always in `name`,
not `ref`. Only 1 building has a `ref`. `pipeline/places/merge.ts`
(`blockCode()`) reads codes from either.

### `ways.geojson` properties

A way is kept when `highway` is one of `footway path pedestrian steps corridor
cycleway living_street residential service unclassified tertiary secondary
primary trunk track road *_link elevator platform`, or when it has
`indoor=corridor`. Motorways are left out. Trunk and primary roads are kept,
so the graph builder can decide what to do with them. The places pipeline does
not use them for door points.

Properties:

- `osm_id`, `inside_campus`.
- `nodes`: the OSM node ids in order. Use them to find junctions. Two ways
  that share a node id are connected.
- These tags when set: `highway`, `footway`, `sidewalk`, `covered`, `indoor`,
  `layer`, `level`, `step_count`, `incline`, `surface`, `access`, `foot`,
  `name`, `ref`, `area`, `tunnel`, `bridge`, `lit`, `wheelchair`, `service`.

Steps are `highway=steps`. OSM has no separate "steps" tag.

### `entrances.geojson`, `pois.geojson`, `areas.geojson`

`osm_id` and `inside_campus`, plus **all** OSM tags of the object. Areas
also have `center`.

## Counts (pbf dated 2026-05-28)

| | Cut (polygon + 200 m) | Inside polygon |
|---|---|---|
| buildings | 2,024 | 530 |
| walkable ways | 1,621 | 1,213 |
| entrances | 10 | 10 |
| POI nodes | 354 | 332 |
| named areas | 160 | 141 |

Named buildings in the cut: 821.

**Compared with the audit** (3,797 buildings, 1,944 ways): the audit counted
the boundary's *bounding box*, not the polygon. A check over that bbox, with
the same pbf, finds 4,416 buildings (734 named) and 2,064 `highway=*` ways. So
the data is complete. The polygon cut is smaller because the bbox also covers
Taman Universiti and the housing estates around the campus.

Only 10 entrance nodes exist on campus. So the places pipeline puts each
building's door point on the outline, at the point nearest a walkable way
(see `addEntrances` in `pipeline/places/build.ts`).

## Licence

OSM data is ODbL. Anything we ship that is built from it needs
"© OpenStreetMap contributors".
