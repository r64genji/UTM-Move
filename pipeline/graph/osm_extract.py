"""Cut the UTM campus (+200 m) out of the OSM .pbf and write GeoJSON to data/raw/osm/.

Usage (from the repo root):
    OSM_PBF=/path/to/malaysia-singapore-brunei-latest.osm.pbf \
        uv run --with osmium --with shapely python pipeline/graph/osm_extract.py

Output format is documented in docs/v2/osm.md.
"""

import json
import math
import os
import sys
from collections import Counter

import osmium
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, mapping, shape
from shapely.prepared import prep

PBF = os.environ.get("OSM_PBF", "/opt/osrm/anythinglah/malaysia-singapore-brunei-latest.osm.pbf")
BOUNDARY = "data/campus-boundary.geojson"
OUT = "data/raw/osm"
BUFFER_M = 200

WALKABLE_HIGHWAY = {
    "footway", "path", "pedestrian", "steps", "corridor", "cycleway", "living_street", "residential",
    "service", "unclassified", "tertiary", "secondary", "primary", "trunk", "track", "road",
    "tertiary_link", "secondary_link", "primary_link", "trunk_link", "elevator", "platform",
}
WAY_TAGS = [
    "highway", "footway", "sidewalk", "covered", "indoor", "layer", "level", "step_count", "incline",
    "surface", "access", "foot", "name", "ref", "area", "tunnel", "bridge", "lit", "wheelchair", "service",
]
POI_KEYS = ["amenity", "shop", "leisure", "tourism", "office", "craft", "healthcare", "sport",
            "public_transport", "railway", "emergency", "historic", "man_made", "club"]
BUILDING_TAGS = ["name", "name:en", "name:ms", "alt_name", "short_name", "official_name", "ref",
                 "addr:housenumber", "building", "building:levels", "amenity", "operator", "access", "layer"]

# Local flat projection (metres) around the campus, good enough for a 5 km area.
boundary_gj = json.load(open(BOUNDARY))
campus = shape(boundary_gj["features"][0]["geometry"])
LAT0 = campus.centroid.y
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574


def to_m(g):
    return affinity.scale(g, xfact=KX, yfact=KY, origin=(0, 0))


def to_deg(g):
    return affinity.scale(g, xfact=1 / KX, yfact=1 / KY, origin=(0, 0))


cut = to_deg(to_m(campus).buffer(BUFFER_M))
cut_p, campus_p = prep(cut), prep(campus)
minx, miny, maxx, maxy = cut.bounds


def in_bbox(lon, lat):
    return minx <= lon <= maxx and miny <= lat <= maxy


def pick(tags, keys):
    return {k: tags[k] for k in keys if k in tags}


def all_tags(tags):
    return {t.k: t.v for t in tags}


def feature(geom, props):
    return {"type": "Feature", "geometry": mapping(geom), "properties": props}


class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.buildings, self.areas, self.ways, self.entrances, self.pois = [], [], [], [], []

    def node(self, n):
        if not n.location.valid() or not in_bbox(n.location.lon, n.location.lat):
            return
        tags = all_tags(n.tags)
        if not tags:
            return
        p = Point(n.location.lon, n.location.lat)
        if not cut_p.contains(p):
            return
        props = {"osm_id": f"n{n.id}", "inside_campus": campus_p.contains(p)}
        if "entrance" in tags or "door" in tags:
            self.entrances.append(feature(p, {**props, **tags}))
        if "name" in tags or any(k in tags for k in POI_KEYS) or tags.get("highway") == "bus_stop":
            self.pois.append(feature(p, {**props, **tags}))

    def way(self, w):
        tags = all_tags(w.tags)
        hw = tags.get("highway")
        if not (hw in WALKABLE_HIGHWAY or tags.get("indoor") == "corridor"):
            return
        try:
            coords = [(nd.lon, nd.lat) for nd in w.nodes]
        except osmium.InvalidLocationError:
            return
        if len(coords) < 2 or not any(in_bbox(x, y) for x, y in coords):
            return
        line = LineString(coords)
        if not cut_p.intersects(line):
            return
        props = {"osm_id": f"w{w.id}", "nodes": [nd.ref for nd in w.nodes],
                 "inside_campus": campus_p.intersects(line), **pick(tags, WAY_TAGS)}
        self.ways.append(feature(line, props))

    def area(self, a):
        tags = all_tags(a.tags)
        is_building = "building" in tags and tags["building"] != "no"
        named = "name" in tags or "ref" in tags
        if not is_building and not named:
            return
        try:
            polys = []
            for outer in a.outer_rings():
                shell = [(n.lon, n.lat) for n in outer]
                holes = [[(n.lon, n.lat) for n in inner] for inner in a.inner_rings(outer)]
                polys.append(Polygon(shell, holes))
        except osmium.InvalidLocationError:
            return
        if not polys or not any(in_bbox(x, y) for p in polys for x, y in p.exterior.coords):
            return
        geom = polys[0] if len(polys) == 1 else MultiPolygon(polys)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty or not cut_p.intersects(geom):
            return
        osm_id = f"{'w' if a.from_way() else 'r'}{a.orig_id()}"
        c = geom.representative_point()
        props = {"osm_id": osm_id, "inside_campus": campus_p.contains(c),
                 "center": [round(c.x, 7), round(c.y, 7)]}
        if is_building:
            self.buildings.append(feature(geom, {**props, **pick(tags, BUILDING_TAGS)}))
        else:
            self.areas.append(feature(geom, {**props, **tags}))


def write(name, feats):
    with open(f"{OUT}/{name}.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, separators=(",", ":"))


def main():
    if not os.path.exists(PBF):
        sys.exit(f"OSM_PBF not found: {PBF}")
    os.makedirs(OUT, exist_ok=True)
    h = Extract()
    h.apply_file(PBF, locations=True, idx="flex_mem")
    for name in ["buildings", "areas", "ways", "entrances", "pois"]:
        write(name, getattr(h, name))
    inside = lambda fs: sum(1 for f in fs if f["properties"]["inside_campus"])
    print(f"pbf: {PBF}")
    for name in ["buildings", "ways", "entrances", "pois", "areas"]:
        fs = getattr(h, name)
        print(f"{name:10s} {len(fs):6d} (inside campus {inside(fs)})")
    print("named buildings:", sum(1 for f in h.buildings if "name" in f["properties"]),
          " with ref:", sum(1 for f in h.buildings if "ref" in f["properties"]))
    print("ways by highway:", dict(Counter(f["properties"].get("highway", "-") for f in h.ways).most_common()))


if __name__ == "__main__":
    main()
