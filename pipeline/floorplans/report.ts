// Coverage map for floor plans: data/raw/reports/floorplans.html (walkways in grey, indoor graphs in colour, one marker per plan).
// Usage: tsx pipeline/floorplans/report.ts   (after run.ts)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const plans: { id: string; title: string; near: { lat: number; lon: number } }[] = read('pipeline/floorplans/plans.json')
const results: Record<string, { accepted: boolean; reason?: string; osm?: string; doors?: number; links?: number }> = read('data/raw/floorplans/results.json')
const ways: number[][][] = read('data/osm/walk-ways.geojson').features.map((f: { geometry: { coordinates: number[][] } }) => f.geometry.coordinates)
const indoor = existsSync('data/overrides/indoor')
  ? readdirSync('data/overrides/indoor').filter((f) => f.endsWith('.geojson')).flatMap((f) => read(`data/overrides/indoor/${f}`).features)
  : []
const [W, H] = [1000, 800]
const all = ways.flat()
const [x0, x1] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))]
const [y0, y1] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))]
const s = Math.min(W / ((x1 - x0) * Math.cos(1.56 * Math.PI / 180)), H / (y1 - y0))
const pt = ([lon, lat]: number[]) => `${((lon - x0) * Math.cos(1.56 * Math.PI / 180) * s).toFixed(1)},${(H - (lat - y0) * s).toFixed(1)}`
const line = (l: number[][], c: string, w: number) => `<polyline points="${l.map(pt).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}"/>`
const svg = [
  ...ways.map((l) => line(l, '#ccc', 1)),
  ...indoor.map((f: { geometry: { type: string; coordinates: number[][] } }) => (f.geometry.type === 'LineString' ? line(f.geometry.coordinates, '#0a84ff', 3) : `<circle cx="${pt(f.geometry.coordinates as never).split(',')[0]}" cy="${pt(f.geometry.coordinates as never).split(',')[1]}" r="3" fill="#0a84ff"/>`)),
  ...plans.map((p) => {
    const [cx, cy] = pt([p.near.lon, p.near.lat]).split(',')
    const ok = results[p.id]?.accepted
    return `<circle cx="${cx}" cy="${cy}" r="7" fill="${ok ? '#30d158' : '#ff3b30'}" fill-opacity=".7"><title>${p.title}</title></circle>`
  }),
].join('\n')
const rows = plans.map((p) => `<tr><td>${p.title}</td><td>${results[p.id]?.accepted ? `georeferenced to ${results[p.id].osm}: ${results[p.id].doors} public doors, ${results[p.id].links} links` : `rejected: ${results[p.id]?.reason}`}</td></tr>`).join('')
writeFileSync('data/raw/reports/floorplans.html', `<!doctype html><meta charset=utf-8><title>Floor plan coverage</title><body style="font:14px sans-serif"><h1>Floor plan coverage</h1><p>${indoor.length} indoor features emitted. Green marker: plan georeferenced; red: rejected (search centre, not the exact building). Blue: indoor doors/links.</p><svg width=${W} height=${H} style="border:1px solid #888">${svg}</svg><table border=1 cellpadding=4>${rows}</table>`)
console.log('data/raw/reports/floorplans.html', indoor.length, 'indoor features')
