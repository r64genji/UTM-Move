// #9: join gosom places to OSM buildings, merge sources, cross-check with v1.
// Reads data/raw/gosom/*.csv and data/raw/osm/*.geojson, writes
// data/raw/places/candidates.json. `npx tsx pipeline/places/merge.ts` also
// writes docs/v2/places-crosscheck.md.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import type { LatLon } from '../../src/domain/schemas.ts'
import { distanceM, distanceToRingM, inRing, loadBoundary } from './geo.ts'
import { readScraped } from './gosom.ts'

export type Source = 'gosom' | 'osm-building' | 'osm-poi' | 'osm-area'

export interface Member {
  src: Source
  id: string
  name: string
  location: LatLon
  /** Google category (gosom only). */
  gcat?: string
  /** OSM tags that say what the thing is (osm only). */
  tags?: Record<string, string>
  /** gosom business status, e.g. "Permanently closed". */
  status?: string
  address?: string
  reviews?: number
}

export interface Candidate {
  id: string
  members: Member[]
  location: LatLon
  buildingId?: string
  buildingName?: string
  /** Block code of the building the pin is in. */
  buildingCode?: string
  blockCode?: string
  /** Nearest named building (for context when the name is generic). */
  near?: string
  /** Metres from the pin to the nearest building outline (0 = inside one). */
  buildingDistM: number
  tag: 'both' | 'google-only' | 'osm-only'
  inV1: boolean
  /** Set when a hard rule drops the candidate before Gemini sees it. */
  drop?: string
}

export interface OsmBuilding {
  id: string
  name?: string
  blockCode?: string
  rings: LatLon[][]
  center: LatLon
  areaM2: number
  insideCampus: boolean
}

type Feature = { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }
const readFc = (name: string): Feature[] => JSON.parse(readFileSync(`data/raw/osm/${name}.geojson`, 'utf8')).features

const KIND_KEYS = ['amenity', 'shop', 'leisure', 'tourism', 'office', 'highway', 'public_transport', 'building',
  'landuse', 'natural', 'man_made', 'sport', 'healthcare', 'craft', 'indoor', 'room', 'place', 'religion', 'operator']

/** UTM block code inside a name: N28a, T05, D07, KTC S07, "S 47", PE44. */
export function blockCode(name: string | undefined): string | undefined {
  if (!name) return undefined
  const m = name.match(/(?:^|[^A-Za-z0-9])([A-Z]{1,2}) ?(\d{1,3})([A-Za-z]?)(?![A-Za-z0-9])/)
  if (!m) return undefined
  return `${m[1]}${m[2].padStart(2, '0')}${m[3].toLowerCase()}`
}

const SYN: Record<string, string> = {
  fakulti: 'faculty', kolej: 'college', perpustakaan: 'library', dewan: 'hall', makmal: 'lab', laboratory: 'lab',
  laboratories: 'lab', kejuruteraan: 'engineering', sains: 'science', pusat: 'centre', center: 'centre',
  sekolah: 'school', pejabat: 'office', masjid: 'mosque', kafe: 'cafe', kafeteria: 'cafe', cafeteria: 'cafe',
  restoran: 'restaurant', klinik: 'clinic', kesihatan: 'health', bangunan: 'building', kedai: 'shop',
  gelanggang: 'court', padang: 'field', kolam: 'pool', renang: 'swimming', bilik: 'room', kuliah: 'lecture',
  tasik: 'lake', taman: 'park', perhentian: 'stop', bas: 'bus', fotostat: 'photocopy', fotostet: 'photocopy',
}
const STOP = new Set(['utm', 'universiti', 'university', 'teknologi', 'technology', 'malaysia', 'johor', 'skudai',
  'bahru', 'jb', 'the', 'of', 'and', 'dan', 'block', 'blok', 'di', 'at', 'campus', 'kampus', 'utmjb'])
/** Names made only of these words say what a thing is, not which one. */
const GENERIC = new Set(['cafe', 'surau', 'parking', 'car', 'park', 'atm', 'bus', 'stop', 'court', 'futsal', 'field',
  'hall', 'office', 'lab', 'shop', 'toilet', 'library', 'restaurant', 'building', 'centre', 'mosque', 'gate',
  'volleyball', 'basketball', 'tennis', 'badminton', 'takraw', 'handball', 'netball', 'room', 'lecture', 'canteen',
  'mini', 'market', 'mart', 'photocopy', 'clinic', 'bank', 'pool', 'gym', 'station', 'lot', 'main', 'entrance'])

export function tokens(name: string): string[] {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/).filter(Boolean).map((t) => SYN[t] ?? t).filter((t) => !STOP.has(t))
}

/** Token containment: 1 when one name's words are all in the other. */
export function nameSim(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let n = 0
  for (const t of A) if (B.has(t)) n++
  return n / Math.min(A.size, B.size)
}

const isGeneric = (name: string) => tokens(name).every((t) => GENERIC.has(t) || /^\d+$/.test(t))

// Hard drop rules. Things that are never a place someone navigates to.
const JUNK_NAME: [RegExp, string][] = [
  [/^\s*$|^unnamed\b|^untitled\b|^no name/i, 'unnamed'],
  [/tong sampah|sampah|waste|rubbish|garbage|\bbins?\b|recycl/i, 'bin/waste'],
  [/\btrees?\b|\bpokok\b/i, 'tree'],
  [/substation|sub-station|pencawang|\btnb\b|transformer|generator/i, 'utility'],
  [/tangki air|water tank|storage tank|rumah pam|pump house|\bloji\b|sewage|kumbahan|meter room/i, 'utility'],
  [/^(ground )?level \d*$|^ground level$|^(main )?lif$|\blift\b|elevator|^tangga\b|staircase/i, 'indoor fixture'],
  [/assembly (point|area|ground)|evacuation|titik berkumpul/i, 'assembly point'],
  [/rumah staff|staff house|staff quarters?|kuarters|rumah pengetua|rumah naib canselor|rumah kediaman|rumah fellow|vice.?chancellor'?s? (house|residence)/i, 'private home'],
  [/bilik server|server room|\bstor\b|\bstore room|storeroom|janitor/i, 'back-of-house room'],
  [/^pondok ?\d*$|^hut$|^wakaf[_ ]|^shelter$|^bench$|^table$/i, 'shelter/furniture'],
  [/laluan berbumbung|covered walkway|^jalan\s|^lorong\s|^persiaran\s|\broad$/i, 'path/road'],
  [/\btandas\b|\btoilets?\b|\bwc\b/i, 'toilet'],
  [/^universiti teknologi malaysia$|^university of technology malaysia$|^utm$|^utm (johor|skudai|jb)$/i, 'whole campus'],
]
const JUNK_TAG: [string, RegExp, string][] = [
  ['amenity', /^(waste_basket|waste_disposal|recycling|bench|table|vending_machine|toilets|shelter|bbq|drinking_water|clock|bicycle_parking|motorcycle_parking|grit_bin|letter_box)$/, 'street furniture'],
  ['leisure', /^(picnic_table|bench)$/, 'street furniture'],
  ['natural', /./, 'natural feature'],
  ['landuse', /^(orchard|forest|military|brownfield|grass|farmland|construction|meadow|plant_nursery|residential)$/, 'land use'],
  ['man_made', /^(storage_tank|tower|water_tower|mast|pipeline|wastewater_plant|water_works|reservoir_covered)$/, 'utility'],
  ['power', /./, 'utility'],
  ['highway', /^bus_stop$/, 'bus stop (comes from transit data)'],
  ['highway', /^(?!pedestrian$)/, 'path/road'],
  ['public_transport', /./, 'bus stop (comes from transit data)'],
  ['amenity', /^bus_station$/, 'bus stop (comes from transit data)'],
  ['indoor', /^(level|corridor|area|wall|door)$/, 'indoor fixture'],
  ['building', /^(roof|shed|hut|garage|garages|service|transformer_tower|water_tower|toilets|construction|ruins|carport)$/, 'minor structure'],
]

export function junkReason(name: string, tags: Record<string, string> = {}, status = '', areaM2 = Infinity): string | undefined {
  if (/closed/i.test(status)) return 'closed'
  // Rows of small code-only houses are staff housing (F01-F50): private homes.
  if (/^(house|detached|semidetached_house|bungalow|terrace)$/.test(tags.building ?? '') && areaM2 < 300 && !!blockCode(name) && tokens(name).length === 1) return 'private home'
  for (const [re, why] of JUNK_NAME) if (re.test(name)) return why
  // A building tag only counts as junk when the building has no real name besides a code.
  for (const [k, re, why] of JUNK_TAG) {
    if (!(k in tags) || !re.test(tags[k])) continue
    if (k === 'building' && !isGeneric(name) && !blockCode(name)) continue
    return why
  }
  return undefined
}

function ringsOf(g: Feature['geometry']): LatLon[][] {
  const toRing = (r: number[][]) => r.map(([lon, lat]) => ({ lat, lon }))
  if (g.type === 'Polygon') return [toRing((g.coordinates as number[][][])[0])]
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).map((p) => toRing(p[0]))
  return []
}

function ringAreaM2(r: LatLon[]): number {
  const k = Math.cos((r[0].lat * Math.PI) / 180) * 111320, ky = 110574
  let s = 0
  for (let i = 1; i < r.length; i++) s += (r[i - 1].lon * k) * (r[i].lat * ky) - (r[i].lon * k) * (r[i - 1].lat * ky)
  return Math.abs(s / 2)
}

export function loadBuildings(): OsmBuilding[] {
  return readFc('buildings').map((f) => {
    const p = f.properties as Record<string, string> & { center: [number, number]; inside_campus: boolean }
    const rings = ringsOf(f.geometry)
    const name = p.name || p['name:en'] || undefined
    return {
      id: `osm-${p.osm_id}`, name, blockCode: blockCode(p.ref) ?? blockCode(name), rings,
      center: { lat: p.center[1], lon: p.center[0] }, areaM2: rings.reduce((s, r) => s + ringAreaM2(r), 0),
      insideCampus: p.inside_campus,
    }
  })
}

export function buildingAt(p: LatLon, buildings: OsmBuilding[]): OsmBuilding | undefined {
  // Smallest containing building wins (a kiosk inside a bigger hall).
  let best: OsmBuilding | undefined
  for (const b of buildings) {
    if (Math.abs(b.center.lat - p.lat) > 0.003 || Math.abs(b.center.lon - p.lon) > 0.003) continue
    if (b.rings.some((r) => inRing(p, r)) && (!best || b.areaM2 < best.areaM2)) best = b
  }
  return best
}

const gid = (placeId: string) => `g-${createHash('sha1').update(placeId).digest('hex').slice(0, 10)}`
const pickTags = (t: Record<string, unknown>) =>
  Object.fromEntries(KIND_KEYS.filter((k) => typeof t[k] === 'string').map((k) => [k, t[k] as string]))

/** Every source row inside the campus, as members. */
export function loadMembers(ring: LatLon[], buildings: OsmBuilding[]): Member[] {
  const out: Member[] = []
  for (const r of readScraped()) {
    const location = { lat: Number(r.latitude), lon: Number(r.longitude) }
    if (!r.title || !inRing(location, ring)) continue
    out.push({ src: 'gosom', id: gid(r.place_id || r.data_id), name: r.title.trim(), location, gcat: r.category || undefined,
      status: r.status || undefined, address: r.address || undefined, reviews: Number(r.review_count) || 0 })
  }
  for (const b of buildings) {
    if (!b.insideCampus || !b.name) continue
    out.push({ src: 'osm-building', id: b.id, name: b.name.trim(), location: b.center, tags: {} })
  }
  const bTags = new Map(readFc('buildings').map((f) => [`osm-${f.properties.osm_id}`, pickTags(f.properties)]))
  for (const m of out) if (m.src === 'osm-building') m.tags = bTags.get(m.id)
  for (const [file, src] of [['pois', 'osm-poi'], ['areas', 'osm-area']] as const) {
    for (const f of readFc(file)) {
      const p = f.properties as Record<string, unknown>
      const name = (p.name || p['name:en']) as string | undefined
      if (!p.inside_campus || !name) continue
      const location = src === 'osm-poi'
        ? { lat: (f.geometry.coordinates as number[])[1], lon: (f.geometry.coordinates as number[])[0] }
        : { lat: (p.center as number[])[1], lon: (p.center as number[])[0] }
      if (!inRing(location, ring)) continue
      out.push({ src, id: `osm-${p.osm_id}`, name: name.trim(), location, tags: pickTags(p) })
    }
  }
  return out
}

/** Symmetric word overlap (Jaccard) of two names. */
export function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b))
  let n = 0
  for (const t of A) if (B.has(t)) n++
  return n ? n / (A.size + B.size - n) : 0
}

/** Words that name a kind of facility: "C23 FKM Library" is in C23, it is not C23. */
const FACILITY = new Set(['surau', 'mosque', 'cafe', 'restaurant', 'library', 'lab', 'hall', 'office', 'atm', 'bank',
  'shop', 'clinic', 'room', 'lecture', 'auditorium', 'gym', 'court', 'parking', 'store', 'canteen', 'kiosk', 'mart',
  'photocopy', 'printing', 'unit', 'studio', 'workshop', 'bengkel', 'musalla', 'prayer', 'stall', 'gerai'])

function groupBy<T>(xs: T[], same: (a: T, b: T) => boolean): T[][] {
  const parent = xs.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (same(xs[i], xs[j])) parent[find(i)] = find(j)
  const out = new Map<number, T[]>()
  xs.forEach((x, i) => { const r = find(i); out.set(r, [...(out.get(r) ?? []), x]) })
  return [...out.values()]
}

const codesClash = (a: string, b: string) => { const x = blockCode(a), y = blockCode(b); return !!x && !!y && x !== y }

/** Two point rows (gosom / OSM node / OSM area) that are the same place. Conservative on purpose. */
export function samePoint(a: Member, b: Member): boolean {
  const d = distanceM(a.location, b.location)
  if (d > 60 || codesClash(a.name, b.name)) return false
  const ka = tokens(a.name).join(' '), kb = tokens(b.name).join(' ')
  const generic = isGeneric(a.name) || isGeneric(b.name)
  if (ka !== '' && ka === kb) return generic ? d <= 15 : true
  return !generic && d <= 25 && jaccard(a.name, b.name) >= 0.75
}

/** A point row that names the building itself (not a room or shop inside it). Higher is better, 0 is no. */
export function buildingMatch(building: string, point: string): number {
  if (codesClash(building, point)) return 0
  const bt = new Set(tokens(building)), pt = tokens(point)
  if (pt.some((t) => FACILITY.has(t) && !bt.has(t))) return 0
  const code = blockCode(building)
  if (code && code === blockCode(point)) return 1
  const j = jaccard(building, point)
  if (j >= 0.5) return j
  return [...bt].every((t) => pt.includes(t)) && bt.size >= 2 ? 0.5 : 0
}

/** Group members that are the same place. */
export function cluster(members: Member[], buildings: OsmBuilding[]): Member[][] {
  const pts = groupBy(members.filter((m) => m.src !== 'osm-building'), samePoint)
  // Same-named buildings close together are one place (a faculty spread over many blocks).
  const blds = groupBy(members.filter((m) => m.src === 'osm-building'), (a, b) =>
    tokens(a.name).join(' ') === tokens(b.name).join(' ') && distanceM(a.location, b.location) <= 400)
  const byId = new Map(buildings.map((b) => [b.id, b]))
  const taken = new Set<Member[]>()
  for (const bg of blds) {
    const polys = bg.map((m) => byId.get(m.id)!)
    let best: Member[] | undefined, bestScore = 0
    for (const g of pts) {
      if (taken.has(g)) continue
      const near = g.some((m) => polys.some((b) => b.rings.some((r) => inRing(m.location, r)) || distanceM(m.location, b.center) <= 25))
      if (!near) continue
      const score = Math.max(...g.map((m) => buildingMatch(bg[0].name, m.name)))
      if (score > bestScore) { best = g; bestScore = score }
    }
    if (best) { taken.add(best); bg.push(...best) }
  }
  return [...blds, ...pts.filter((g) => !taken.has(g))]
}

const SRC_RANK: Record<Source, number> = { 'osm-building': 0, 'osm-area': 1, 'osm-poi': 2, gosom: 3 }

export function toCandidate(ms: Member[], buildings: OsmBuilding[]): Candidate {
  ms.sort((a, b) => SRC_RANK[a.src] - SRC_RANK[b.src] || (b.reviews ?? 0) - (a.reviews ?? 0))
  const primary = ms[0]
  const blds = ms.filter((m) => m.src === 'osm-building').map((m) => buildings.find((b) => b.id === m.id)!)
  const biggest = blds.sort((a, b) => b.areaM2 - a.areaM2)[0]
  const g = ms.find((m) => m.src === 'gosom')
  const poi = ms.find((m) => m.src === 'osm-poi' || m.src === 'osm-area')
  let location: LatLon, building: OsmBuilding | undefined
  if (biggest) {
    // A building place sits at its building; a gosom pin inside it is kept (the actual door side).
    const pinIn = g && blds.find((b) => b.rings.some((r) => inRing(g.location, r)))
    building = pinIn || biggest
    location = pinIn ? g!.location : biggest.center
  } else {
    location = (poi ?? g ?? primary).location
    building = buildingAt(location, buildings)
  }
  const code = blockCode(ms.find((m) => blockCode(m.name))?.name) ?? building?.blockCode
  const hasG = ms.some((m) => m.src === 'gosom'), hasO = ms.some((m) => m.src !== 'gosom')
  return {
    id: primary.id, members: ms, location,
    buildingId: building?.id, buildingName: building?.name, buildingCode: building?.blockCode, blockCode: code,
    tag: hasG && hasO ? 'both' : hasG ? 'google-only' : 'osm-only', inV1: false,
    buildingDistM: building ? 0 : Math.round(Math.min(150, ...buildings
      .filter((b) => Math.abs(b.center.lat - location.lat) < 0.002 && Math.abs(b.center.lon - location.lon) < 0.002)
      .flatMap((b) => b.rings.map((r) => distanceToRingM(location, r))))),
  }
}

interface V1Place { id: string; osmId: number; osmType: string; name: string; lat: number; lon: number; category: string }

export function loadV1(): V1Place[] {
  const raw = execFileSync('git', ['show', 'v1:Backend/data/campus_locations.json'], { encoding: 'utf8', maxBuffer: 1 << 26 })
  return JSON.parse(raw).locations
}

export function build() {
  const ring = loadBoundary()
  const buildings = loadBuildings()
  const members = loadMembers(ring, buildings)
  const dropped: Member[] = []
  const live: Member[] = []
  for (const m of members) {
    const why = junkReason(m.name, m.tags, m.status, buildings.find((b) => b.id === m.id)?.areaM2)
    if (why) dropped.push(Object.assign(m, { drop: why }))
    else live.push(m)
  }
  const candidates = cluster(live, buildings).map((ms) => toCandidate(ms, buildings))
  for (const m of dropped) {
    candidates.push({ ...toCandidate([m], buildings), drop: (m as Member & { drop: string }).drop })
  }
  // Nearest named building, for context.
  const named = buildings.filter((b) => b.insideCampus && b.name)
  for (const c of candidates) {
    let best: OsmBuilding | undefined, bd = 150
    for (const b of named) { const d = distanceM(c.location, b.center); if (d < bd) { bd = d; best = b } }
    if (best && best.id !== c.buildingId) c.near = best.name
  }
  // v1 cross-check: same OSM object, else similar name within 50 m.
  const v1 = loadV1()
  const byMember = new Map<string, Candidate>()
  for (const c of candidates) for (const m of c.members) byMember.set(m.id, c)
  const v1Only: (V1Place & { why: string })[] = []
  for (const v of v1) {
    const osmId = `osm-${v.osmType[0]}${v.osmId}`
    let c = byMember.get(osmId)
    if (!c) {
      c = candidates.find((x) => distanceM(x.location, v) <= 50 && x.members.some((m) => nameSim(m.name, v.name) >= 0.75))
    }
    if (c) c.inV1 = true
    else {
      const inside = inRing({ lat: v.lat, lon: v.lon }, ring)
      v1Only.push({ ...v, why: /^unnamed/i.test(v.name) ? 'unnamed in v1' : !inside ? 'outside boundary' : 'not in current OSM/gosom' })
    }
  }
  mkdirSync('data/raw/places', { recursive: true })
  writeFileSync('data/raw/places/candidates.json', JSON.stringify(candidates, null, 1))
  return { members, dropped, candidates, v1, v1Only, scraped: readScraped().length }
}

function report(r: ReturnType<typeof build>): string {
  const live = r.candidates.filter((c) => !c.drop)
  const ex = (cs: Candidate[]) => cs.slice(0, 10).map((c) => `  - ${c.members.map((m) => `${m.name} (${m.src}${m.gcat ? `: ${m.gcat}` : ''})`).join(' + ')}${c.buildingName ? ` — in building "${c.buildingName}"` : ''}`).join('\n')
  const pick = (t: Candidate['tag']) => live.filter((c) => c.tag === t).sort((a, b) => a.id.localeCompare(b.id))
  const byReason = new Map<string, number>()
  for (const m of r.dropped) { const k = (m as Member & { drop: string }).drop; byReason.set(k, (byReason.get(k) ?? 0) + 1) }
  const srcCount = (s: Source) => r.members.filter((m) => m.src === s).length
  return `# Places cross-check (#9)

Generated by \`npx tsx pipeline/places/merge.ts\`. Inputs: gosom grid scrape
(\`data/raw/gosom/\`), OSM extract (\`data/raw/osm/\`), and v1
\`Backend/data/campus_locations.json\` (tag \`v1\`).

## Counts

| Stage | Count |
|---|---|
| gosom rows (unique place_id, all) | ${r.scraped} |
| gosom rows inside the boundary | ${srcCount('gosom')} |
| OSM named buildings inside | ${srcCount('osm-building')} |
| OSM named POI nodes inside | ${srcCount('osm-poi')} |
| OSM named areas inside | ${srcCount('osm-area')} |
| dropped by hard rules | ${r.dropped.length} |
| candidates after merge (not dropped) | ${live.length} |
| v1 places | ${r.v1.length} |

Hard-rule drops by reason: ${[...byReason].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}.

## Tags

| Tag | Count | Also in v1 |
|---|---|---|
| both (Google + OSM) | ${pick('both').length} | ${pick('both').filter((c) => c.inV1).length} |
| google-only | ${pick('google-only').length} | ${pick('google-only').filter((c) => c.inV1).length} |
| osm-only | ${pick('osm-only').length} | ${pick('osm-only').filter((c) => c.inV1).length} |
| v1-only (v1 place with no candidate) | ${r.v1Only.length} | |

v1-only by reason: ${[...new Set(r.v1Only.map((v) => v.why))].map((w) => `${w} ${r.v1Only.filter((v) => v.why === w).length}`).join(', ')}.

### both (10 examples)
${ex(pick('both'))}

### google-only (10 examples)
${ex(pick('google-only'))}

### osm-only (10 examples)
${ex(pick('osm-only'))}

### v1-only (10 examples, named only)
${r.v1Only.filter((v) => !/^unnamed/i.test(v.name)).slice(0, 10).map((v) => `  - ${v.name} (${v.category}, ${v.osmType} ${v.osmId}) — ${v.why}`).join('\n')}
`
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync('data/raw/osm/buildings.geojson')) throw new Error('run pipeline/graph/osm_extract.py first')
  const r = build()
  const md = report(r)
  writeFileSync('docs/v2/places-crosscheck.md', md)
  console.log(md.split('## Tags')[0])
}
