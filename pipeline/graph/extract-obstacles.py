# Building and water outlines inside the walk-network bbox, for the gap closer in build.ts.
# Run: uv run --with osmium python pipeline/graph/extract-obstacles.py   (needs OSM_PBF; CI does not)
# Writes data/osm/obstacles.geojson: closed rings as LineStrings, 5 decimals.
import json, os, sys
import osmium

PBF = os.environ.get('OSM_PBF', '/opt/osrm/anythinglah/malaysia-singapore-brunei-latest.osm.pbf')
W, S, E, N = 103.6101, 1.5440, 103.6630, 1.5781  # walk-ways bbox + ~100 m
WATER = {'river', 'stream', 'canal', 'drain', 'ditch'}

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.feats = []

    def way(self, w):
        t = w.tags
        kind = None
        if t.get('building') and t.get('building') != 'no': kind = 'building'
        elif t.get('natural') == 'water' or t.get('waterway') in WATER: kind = 'water'
        if not kind: return
        try:
            pts = [(round(n.lon, 5), round(n.lat, 5)) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        if len(pts) < 2 or not any(W < x < E and S < y < N for x, y in pts): return
        self.feats.append({'type': 'Feature', 'properties': {'kind': kind}, 'geometry': {'type': 'LineString', 'coordinates': [list(p) for p in pts]}})

# Keep outlines with a vertex within ~80 m of a walk-way vertex: only those can sit in a gap.
cell = lambda x, y: (int(x / 0.0008), int(y / 0.0008))
near = {cell(x, y) for f in json.load(open('data/osm/walk-ways.geojson'))['features'] for x, y in f['geometry']['coordinates']}
close = lambda x, y: any((cell(x, y)[0] + i, cell(x, y)[1] + j) in near for i in (-1, 0, 1) for j in (-1, 0, 1))

h = H()
h.apply_file(PBF, locations=True)
h.feats = [f for f in h.feats if any(close(x, y) for x, y in f['geometry']['coordinates'])]
with open('data/osm/obstacles.geojson', 'w') as f:
    f.write('{"type":"FeatureCollection","features":[\n' + ',\n'.join(json.dumps(x, separators=(',', ':')) for x in h.feats) + '\n]}\n')
print(len(h.feats), 'outlines', file=sys.stderr)
