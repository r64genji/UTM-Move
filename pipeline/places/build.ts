// #12: emit public/data/places.json (+ search input) and the coverage report.
// `npm run build:places`
//   - with data/raw/gosom + data/raw/osm present: merge -> Gemini clean (cached) -> check -> overrides
//     -> writes data/places.curated.json (committed) and public/data/.
//   - without raw data, or with --curated (CI): validates data/places.curated.json and emits public/data/ from it.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { Place, type LatLon } from '../../src/domain/schemas.ts'
import { distanceM, distanceToSegmentM, inRing, loadBoundary, nearestOnSegment } from './geo.ts'
import { blockCode, loadBuildings, tokens, type OsmBuilding } from './merge.ts'
import { loadOverrides, type Overrides } from './overrides.ts'
import type { Row } from './clean.ts'

export const CURATED = 'data/places.curated.json'

/** Problems that must never ship. Empty array = valid. */
export function validatePlaces(places: unknown[], ring: LatLon[]): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const raw of places) {
    const r = Place.safeParse(raw)
    if (!r.success) { errors.push(`schema: ${JSON.stringify(raw).slice(0, 80)}: ${r.error.issues[0]?.message}`); continue }
    const p = r.data
    if (ids.has(p.id)) errors.push(`duplicate id ${p.id}`)
    ids.add(p.id)
    if (/^\s*$|unnamed|untitled/i.test(p.name)) errors.push(`unnamed: ${p.id} "${p.name}"`)
    if (!inRing(p.location, ring)) errors.push(`outside boundary: ${p.id} ${p.name}`)
  }
  return errors
}

export interface Resolved {
  places: Place[]
  dropped: { id: string; name: string; reason: string }[]
  pending: Row[]
}

/** Apply Gemini output + overrides. Flagged rows without a decision are held back (strict). */
export function resolve(rows: Row[], overrides: Overrides): Resolved {
  const dropped: Resolved['dropped'] = []
  const pending: Row[] = []
  const status = new Map<string, 'keep' | 'drop' | 'pending' | { into: string }>()
  for (const r of rows) {
    const d = overrides[r.id]
    if (d) status.set(r.id, d.action === 'drop' ? 'drop' : d.action === 'merge' ? { into: d.mergeInto! } : 'keep')
    else if (r.flags.length) status.set(r.id, 'pending')
    else if (r.clean.should_drop) status.set(r.id, 'drop')
    else if (r.clean.merge_with && r.clean.merge_with !== r.id) status.set(r.id, { into: r.clean.merge_with })
    else status.set(r.id, 'keep')
  }
  const finalOf = (id: string, seen = new Set<string>()): string | undefined => {
    const s = status.get(id)
    if (s === 'keep') return id
    if (!s || typeof s === 'string' || seen.has(id)) return undefined
    seen.add(id)
    return finalOf(s.into, seen)
  }
  const kept = new Map<string, Place>()
  for (const r of rows) {
    if (status.get(r.id) !== 'keep') continue
    const d = overrides[r.id]
    const name = d?.name ?? r.clean.name
    kept.set(r.id, {
      id: r.id, name, aliases: d?.aliases ?? r.clean.aliases,
      category: (d?.category ?? r.clean.category) as Place['category'],
      location: d?.location ?? r.location,
      ...(r.buildingId ? { buildingId: r.buildingId } : {}),
      ...((blockCode(name) ?? r.blockCode) ? { blockCode: blockCode(name) ?? r.blockCode } : {}),
    })
  }
  for (const r of rows) {
    const s = status.get(r.id)!
    if (s === 'keep') continue
    if (s === 'pending') { pending.push(r); continue }
    const name = r.clean.name || r.members[0].name
    if (s === 'drop') { dropped.push({ id: r.id, name: r.members[0].name, reason: overrides[r.id]?.note ?? r.clean.reason }); continue }
    const into = finalOf(r.id)
    const target = into && kept.get(into)
    if (!target) { dropped.push({ id: r.id, name: r.members[0].name, reason: `merge target ${s.into} not kept` }); continue }
    // The merged row's names become search aliases of the place it joined.
    target.aliases.push(name, ...r.clean.aliases, ...r.members.map((m) => m.name))
  }
  for (const p of kept.values()) {
    const seen = new Set([tokens(p.name).join(' ')])
    p.aliases = p.aliases.map((a) => a.trim()).filter((a) => {
      const k = tokens(a).join(' ')
      if (!k || seen.has(k) || a.length > 60) return false
      seen.add(k)
      return true
    }).slice(0, 8)
  }
  return { places: [...kept.values()].sort((a, b) => a.id.localeCompare(b.id)), dropped, pending }
}

type Feature = { geometry: { type: string; coordinates: number[][] | number[] }; properties: Record<string, unknown> }
const NOT_FOR_WALKING = /^(trunk|trunk_link|motorway|motorway_link|primary|primary_link)$/

/** Door points: OSM entrances on the outline, else the outline point nearest a walkable way. */
export function addEntrances(places: Place[], rows: Row[]): void {
  const buildings = new Map(loadBuildings().map((b) => [b.id, b]))
  const areaRings = new Map<string, LatLon[][]>()
  for (const f of JSON.parse(readFileSync('data/raw/osm/areas.geojson', 'utf8')).features as Feature[]) {
    const g = f.geometry as unknown as { type: string; coordinates: number[][][] | number[][][][] }
    const polys = g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][])
    areaRings.set(`osm-${f.properties.osm_id}`, polys.map((p) => p[0].map(([lon, lat]) => ({ lat, lon }))))
  }
  const ways = (JSON.parse(readFileSync('data/raw/osm/ways.geojson', 'utf8')).features as Feature[])
    .filter((f) => !NOT_FOR_WALKING.test(String(f.properties.highway)) && !/^(private|no)$/.test(String(f.properties.access)))
    .map((f) => (f.geometry.coordinates as number[][]).map(([lon, lat]) => ({ lat, lon })))
  const doors = (JSON.parse(readFileSync('data/raw/osm/entrances.geojson', 'utf8')).features as Feature[])
    .map((f) => ({ lat: (f.geometry.coordinates as number[])[1], lon: (f.geometry.coordinates as number[])[0] }))
  const rowById = new Map(rows.map((r) => [r.id, r]))
  for (const p of places) {
    const row = rowById.get(p.id)
    const b: OsmBuilding | undefined = p.buildingId ? buildings.get(p.buildingId) : undefined
    const area = row?.members.find((m) => m.src === 'osm-area')
    const rings = b?.rings ?? (area ? areaRings.get(area.id) : undefined)
    if (!rings) continue
    const onOutline = doors.filter((d) => rings.some((r) => inRing(d, r) || r.some((_, i) => i > 0 && distanceToSegmentM(d, r[i - 1], r[i]) < 2)))
    if (onOutline.length) { p.entrances = onOutline.slice(0, 4).map(round); continue }
    let best: { at: LatLon; d: number } | undefined
    for (const r of rings) {
      for (const w of ways) {
        if (!w.some((q) => distanceM(q, r[0]) < 400)) continue
        for (const q of w) {
          for (let i = 1; i < r.length; i++) {
            const d = distanceToSegmentM(q, r[i - 1], r[i])
            if (!best || d < best.d) best = { at: nearestOnSegment(q, r[i - 1], r[i]), d }
          }
        }
      }
    }
    if (best && best.d < 150) p.entrances = [round(best.at)]
  }
}

const round = (p: LatLon): LatLon => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) })

const COLORS: Record<string, string> = {
  'Faculty/Academic': '#1f77b4', 'Lab/Workshop': '#17becf', Library: '#9467bd', 'Residential college': '#8c564b',
  Food: '#ff7f0e', Prayer: '#2ca02c', Sport: '#bcbd22', 'Admin/Office': '#7f7f7f', Health: '#d62728', 'Bank/ATM': '#e377c2',
  'Shop/Service': '#ff9896', 'Hall/Event': '#aec7e8', Parking: '#393b79', 'Bus stop': '#000000', 'Gate/Entrance': '#637939', Other: '#c7c7c7',
}

export function reportHtml(places: Place[], dropped: { id: string; name: string; reason: string; location?: LatLon }[]): string {
  const fc = { type: 'FeatureCollection', features: places.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.location.lon, p.location.lat] }, properties: { id: p.id, name: p.name, category: p.category, aliases: p.aliases.join(', '), blockCode: p.blockCode ?? '', color: COLORS[p.category] } })) }
  const doors = { type: 'FeatureCollection', features: places.flatMap((p) => (p.entrances ?? []).map((e) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[p.location.lon, p.location.lat], [e.lon, e.lat]] }, properties: {} }))) }
  const counts = Object.entries(places.reduce<Record<string, number>>((a, p) => ({ ...a, [p.category]: (a[p.category] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
  return `<!doctype html><html><head><meta charset="utf-8"><title>UTM places coverage</title>
<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet"><script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<style>body{margin:0;font:13px system-ui}#map{position:absolute;inset:0 340px 0 0}#side{position:absolute;right:0;top:0;bottom:0;width:340px;overflow:auto;padding:8px;box-sizing:border-box}
.dot{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:4px}li{cursor:pointer}</style></head><body>
<div id="map"></div><div id="side"><h3>${places.length} places</h3>
<p>${counts.map(([c, n]) => `<span class="dot" style="background:${COLORS[c]}"></span>${c}: ${n}`).join('<br>')}</p>
<p>Lines show place pin to entrance. Imagery: Esri World Imagery. Map data © OpenStreetMap contributors.</p>
<input id="q" placeholder="filter" style="width:100%"><ul id="list"></ul>
<details><summary>${dropped.length} dropped</summary><ul>${dropped.map((d) => `<li>${esc(d.name)} — ${esc(d.reason)}</li>`).join('')}</ul></details></div>
<script>
const fc=${JSON.stringify(fc)};const doors=${JSON.stringify(doors)};
const map=new maplibregl.Map({container:'map',style:{version:8,sources:{esri:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Esri'}},layers:[{id:'esri',type:'raster',source:'esri'}]},center:[103.638,1.561],zoom:15});
map.on('load',()=>{map.addSource('p',{type:'geojson',data:fc});map.addSource('d',{type:'geojson',data:doors});
map.addLayer({id:'d',type:'line',source:'d',paint:{'line-color':'#fff','line-width':1.5}});
map.addLayer({id:'p',type:'circle',source:'p',paint:{'circle-radius':5,'circle-color':['get','color'],'circle-stroke-color':'#fff','circle-stroke-width':1}});
map.addLayer({id:'l',type:'symbol',source:'p',minzoom:17,layout:{'text-field':['get','name'],'text-size':11,'text-offset':[0,1],'text-anchor':'top'},paint:{'text-color':'#fff','text-halo-color':'#000','text-halo-width':1}});
map.on('click','p',e=>{const p=e.features[0].properties;new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<b>'+p.name+'</b><br>'+p.category+'<br>'+p.aliases+'<br><small>'+p.id+'</small>').addTo(map)})});
const list=document.getElementById('list');function draw(q){list.innerHTML='';fc.features.filter(f=>!q||(f.properties.name+' '+f.properties.aliases).toLowerCase().includes(q)).forEach(f=>{const li=document.createElement('li');li.innerHTML='<span class=dot style=background:'+f.properties.color+'></span>'+f.properties.name;li.onclick=()=>map.flyTo({center:f.geometry.coordinates,zoom:18});list.appendChild(li)})}
draw('');document.getElementById('q').oninput=e=>draw(e.target.value.toLowerCase());
</script></body></html>`
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

function emit(places: Place[]) {
  mkdirSync('public/data', { recursive: true })
  writeFileSync('public/data/places.json', JSON.stringify(places))
  // Search index input (#26 builds the MiniSearch index from this).
  writeFileSync('public/data/places-search.json', JSON.stringify(places.map((p) => ({
    id: p.id, name: p.name, aliases: p.aliases, category: p.category, ...(p.blockCode ? { blockCode: p.blockCode } : {}),
  }))))
}

async function main() {
  const ring = loadBoundary()
  const haveRaw = !process.argv.includes('--curated') && existsSync('data/raw/osm/buildings.geojson') && existsSync('data/raw/gosom') &&
    readdirSync('data/raw/gosom').some((f) => f.endsWith('.csv'))
  if (!haveRaw) {
    const overrides = loadOverrides()
    const places = z.array(Place).parse(JSON.parse(readFileSync(CURATED, 'utf8')))
      .filter((p) => !['drop', 'merge'].includes(overrides[p.id]?.action ?? ''))
      .map((p) => { const d = overrides[p.id]; return d?.action === 'fix' ? { ...p, ...(d.name && { name: d.name }), ...(d.category && { category: d.category }), ...(d.aliases && { aliases: d.aliases }), ...(d.location && { location: d.location }) } : p })
    const errors = validatePlaces(places, ring)
    if (errors.length) throw new Error(`invalid ${CURATED}:\n${errors.join('\n')}`)
    emit(places)
    console.log(`no raw data: emitted ${places.length} places from ${CURATED}`)
    return
  }
  const { run } = await import('./clean.ts')
  const { merged, rows, flagged } = await run()
  const res = resolve(rows, loadOverrides())
  addEntrances(res.places, rows)
  const errors = validatePlaces(res.places, ring)
  if (errors.length) throw new Error(`invalid places:\n${errors.join('\n')}`)
  writeFileSync(CURATED, JSON.stringify(res.places, null, 1) + '\n')
  emit(res.places)
  const rowLoc = new Map(rows.map((r) => [r.id, r.location]))
  const allDropped = [
    ...merged.candidates.filter((c) => c.drop).map((c) => ({ id: c.id, name: c.members[0].name, reason: `rule: ${c.drop}`, location: c.location })),
    ...res.dropped.map((d) => ({ ...d, location: rowLoc.get(d.id) })),
  ]
  mkdirSync('data/raw/reports', { recursive: true })
  writeFileSync('data/raw/reports/places.html', reportHtml(res.places, allDropped))
  const reasons = new Map<string, number>()
  for (const c of merged.candidates) if (c.drop) reasons.set(`rule: ${c.drop}`, (reasons.get(`rule: ${c.drop}`) ?? 0) + 1)
  const geminiDrops = rows.filter((r) => res.dropped.some((d) => d.id === r.id) && r.clean.should_drop && !loadOverrides()[r.id]).length
  const mergedAway = rows.filter((r) => r.clean.merge_with && r.clean.merge_with !== r.id && !r.flags.length).length
  const srcN = (s: string) => merged.members.filter((m) => m.src === s).length
  console.log(`gosom scraped (unique): ${merged.scraped}
gosom inside boundary: ${srcN('gosom')}
OSM named inside: buildings ${srcN('osm-building')}, nodes ${srcN('osm-poi')}, areas ${srcN('osm-area')}
dropped by hard rules: ${[...reasons.values()].reduce((a, b) => a + b, 0)} (${[...reasons].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.slice(6)} ${n}`).join(', ')})
candidates after merge: ${rows.length}
gemini drops: ${geminiDrops}, gemini merges: ${mergedAway}
flagged: ${flagged.length} (pending review, held back: ${res.pending.length})
overrides: ${Object.keys(loadOverrides()).length}
final places: ${res.places.length} (with entrances: ${res.places.filter((p) => p.entrances?.length).length})
wrote ${CURATED}, public/data/places.json, public/data/places-search.json, data/raw/reports/places.html`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
