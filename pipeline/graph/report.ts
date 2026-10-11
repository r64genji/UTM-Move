// data/raw/reports/graph.html: every edge coloured by kind, stops, dropped islands.
import type { LatLon } from '../../src/domain/schemas.ts'
import type { GraphInput } from '../../src/domain/walk/graph.ts'
import type { BuildReport } from './build.ts'

const COLORS: Record<string, string> = {
  road: '#888', footway: '#2a7', path: '#7a2', steps: '#e33', covered: '#27c', indoor: '#a3c',
  shortcut: '#f80', door: '#c0a', crossing: '#0bb', ramp: '#995', connector: '#f0f',
}

export function graphReport(g: GraphInput, r: BuildReport, stops: { id: string; location: LatLon }[]): string {
  const all = [...g.nodes, ...r.droppedEdges.flatMap((e) => e.pts)]
  const lat0 = Math.max(...all.map((p) => p.lat)), lon0 = Math.min(...all.map((p) => p.lon))
  const k = 12000 // px per degree
  const x = (p: LatLon) => ((p.lon - lon0) * k * 0.9998).toFixed(1)
  const y = (p: LatLon) => ((lat0 - p.lat) * k).toFixed(1)
  const line = (pts: LatLon[]) => pts.map((p) => `${x(p)},${y(p)}`).join(' ')
  const w = Math.max(...all.map((p) => +x(p))) + 20, h = Math.max(...all.map((p) => +y(p))) + 20
  const edges = g.edges.map((e) => `<polyline class="e" stroke="${COLORS[e.kind]}" data-k="${e.kind}" points="${line([g.nodes[e.from], ...(e.geometry ?? []), g.nodes[e.to]])}"><title>${e.kind} ${e.lengthM} m</title></polyline>`)
  const islands = r.droppedEdges.map((e) => `<polyline class="i" points="${line(e.pts)}"/>`)
  const dots = stops.map((s) => `<circle cx="${x(s.location)}" cy="${y(s.location)}" r="4" fill="#000"><title>${s.id}</title></circle>`)
  const legend = Object.entries(COLORS).map(([n, c]) => `<span style="color:${c}">&#9632; ${n}</span>`).join(' ')
  return `<!doctype html><meta charset="utf-8"><title>walk graph</title><style>body{font:13px sans-serif;margin:8px}.e{fill:none;stroke-width:1.6}.i{fill:none;stroke:red;stroke-width:3;opacity:.6}</style>
<p>${g.nodes.length} nodes, ${g.edges.length} edges. ${legend} <span style="color:red">&#9632; dropped islands (${r.islands.length})</span> &#9679; stops</p>
<svg width="${w}" height="${h}" style="background:#fafafa">${islands.join('')}${edges.join('')}${dots.join('')}</svg>`
}
