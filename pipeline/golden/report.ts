// Report: ours vs Google vs real for every golden trip, with a small map each.
// Run: npx tsx pipeline/golden/report.ts  -> data/raw/reports/golden.html (MapLibre from a CDN, open locally)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { loadTrips, type OptionSummary } from './lib.ts'

const j = (f: string) => JSON.parse(readFileSync(`tests/golden/${f}.json`, 'utf8'))
const baseline: Record<string, { straightM: number; options: OptionSummary[] }> = j('baseline')
const google: Record<string, { duration_s: number | null; distance_m: number | null }> = j('google')
const real: Record<string, { duration_s: number | null; mode: string | null }> = j('real')
const trips = loadTrips()
const min = (s: number | null) => (s == null ? '-' : `${(s / 60).toFixed(1)} min`)
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

const rows = trips.map((t) => {
  const b = baseline[t.id]
  const walk = b.options.find((o) => o.kind === 'walk')!
  const best = b.options.reduce((a, o) => (o.durationS < a.durationS ? o : a))
  const g = google[t.id]
  const ratio = g.duration_s ? walk.durationS / g.duration_s : null
  const flag = ratio == null ? '' : ratio > 1.25 ? 'slower' : ratio < 0.75 ? 'faster' : ''
  return { t, b, walk, best, g, ratio, flag, r: real[t.id] }
})

const cards = rows.map(({ t, b }, i) => `<div class="card"><h3>${esc(t.name)}</h3><div id="m${i}" class="map"></div>
<small>straight ${b.straightM} m | ${b.options.map((o) => `${o.kind} ${min(o.durationS)} (${o.legs.map((l) => l.route ?? 'walk').join('+')})`).join(' | ')}</small></div>`).join('\n')

const html = `<!doctype html><meta charset=utf-8><title>UTM Move golden trips</title>
<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel=stylesheet>
<style>body{font:14px system-ui;margin:20px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 8px;text-align:right}td:first-child,td:nth-child(2){text-align:left}
tr.slower td{background:#fde2e2}tr.faster td{background:#e2f0fd}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px;margin-top:20px}.map{height:220px}.card{border:1px solid #ccc;padding:6px}h3{margin:0 0 4px;font-size:13px}</style>
<h1>Golden trips: ours vs Google vs real</h1>
<p>Our walk-only time is compared with Google walking. Red: ours more than 25% slower. Blue: ours more than 25% faster. Google rounds to whole minutes. Real = OSM GPS trace passing both ends (walk = walker, bus = vehicle trace, so compare to the ride, not the door-to-door time).</p>
<table><tr><th>Trip</th><th>Category</th><th>Straight m</th><th>Our walk</th><th>Our walk m</th><th>Detour</th><th>Google</th><th>Google m</th><th>Ours/Google</th><th>Our best</th><th>Real</th></tr>
${rows.map((x) => `<tr class="${x.flag}"><td>${esc(x.t.name)}</td><td>${x.t.category}</td><td>${x.b.straightM}</td><td>${min(x.walk.durationS)}</td><td>${x.walk.walkM}</td><td>${(x.walk.walkM / x.b.straightM).toFixed(2)}</td><td>${min(x.g.duration_s)}</td><td>${x.g.distance_m ?? '-'}</td><td>${x.ratio ? x.ratio.toFixed(2) : '-'}</td><td>${x.best.kind} ${min(x.best.durationS)}</td><td>${x.r.duration_s == null ? '-' : `${min(x.r.duration_s)} (${x.r.mode})`}</td></tr>`).join('\n')}</table>
<div class=grid>${cards}</div>
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<script>
const data=${JSON.stringify(rows.map((x) => ({ from: [x.t.from.lon, x.t.from.lat], to: [x.t.to.lon, x.t.to.lat], opts: x.b.options.map((o) => o.legs.map((l) => ({ bus: l.kind === 'bus', g: l.geometry.map((p) => [p[1], p[0]]) }))) })))}
const style={version:8,sources:{o:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'OSM'}},layers:[{id:'o',type:'raster',source:'o'}]}
data.forEach((d,i)=>{const m=new maplibregl.Map({container:'m'+i,style,bounds:[d.from,d.to].reduce((b,c)=>b.extend(c),new maplibregl.LngLatBounds(d.from,d.from)),fitBoundsOptions:{padding:30}})
m.on('load',()=>{d.opts.forEach((legs,k)=>legs.forEach((l,n)=>{const id='l'+k+'-'+n;m.addSource(id,{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:l.g}}})
m.addLayer({id,type:'line',source:id,paint:{'line-color':k===0?'#d33':l.bus?'#06c':'#393','line-width':k===0?4:2,'line-dasharray':l.bus?[1,0]:[2,1]}})}))
new maplibregl.Marker({color:'green'}).setLngLat(d.from).addTo(m);new maplibregl.Marker({color:'red'}).setLngLat(d.to).addTo(m)})})
</script>`
mkdirSync('data/raw/reports', { recursive: true })
writeFileSync('data/raw/reports/golden.html', html)
console.log('report: data/raw/reports/golden.html', trips.length, 'trips')
