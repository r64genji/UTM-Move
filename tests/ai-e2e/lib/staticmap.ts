// Static map image: Esri World Imagery tile mosaic with points and lines drawn on top (sharp).
// Esri only, never Google. Tiles are cached on disk.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import type { LatLon } from './checks.ts'

const TILE_URL = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
const CACHE = 'data/raw/cache/ai-e2e/tiles'

export interface MapPoint extends LatLon { label?: string; color?: string }
export interface MapLine { path: LatLon[]; color: string }

const worldPx = (p: LatLon, z: number) => {
  const n = 256 * 2 ** z
  const s = Math.sin((p.lat * Math.PI) / 180)
  return { x: ((p.lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }
}

async function tile(z: number, x: number, y: number): Promise<Buffer | null> {
  const file = join(CACHE, String(z), String(x), `${y}.jpg`)
  if (existsSync(file)) return readFileSync(file)
  try {
    const res = await fetch(TILE_URL(z, x, y), { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, buf)
    return buf
  } catch {
    return null
  }
}

/** Fit all points and lines in at most 4x4 tiles (1024 px), at the highest zoom that allows. */
export async function renderMap(points: MapPoint[], lines: MapLine[] = []): Promise<Buffer> {
  const all = [...points, ...lines.flatMap((l) => l.path)]
  const lat0 = Math.min(...all.map((p) => p.lat)), lat1 = Math.max(...all.map((p) => p.lat))
  const lon0 = Math.min(...all.map((p) => p.lon)), lon1 = Math.max(...all.map((p) => p.lon))
  const padLat = Math.max((lat1 - lat0) * 0.08, 0.0004), padLon = Math.max((lon1 - lon0) * 0.08, 0.0004)
  const sw = { lat: lat0 - padLat, lon: lon0 - padLon }, ne = { lat: lat1 + padLat, lon: lon1 + padLon }
  let z = 18
  for (; z > 12; z--) {
    const a = worldPx(sw, z), b = worldPx(ne, z)
    if (Math.floor(b.x / 256) - Math.floor(a.x / 256) < 4 && Math.floor(a.y / 256) - Math.floor(b.y / 256) < 4) break
  }
  const a = worldPx(sw, z), b = worldPx(ne, z)
  const tx0 = Math.floor(a.x / 256), tx1 = Math.floor(b.x / 256), ty0 = Math.floor(b.y / 256), ty1 = Math.floor(a.y / 256)
  const w = (tx1 - tx0 + 1) * 256, h = (ty1 - ty0 + 1) * 256
  const layers: OverlayOptions[] = []
  for (let x = tx0; x <= tx1; x++)
    for (let y = ty0; y <= ty1; y++) {
      const t = await tile(z, x, y)
      if (t) layers.push({ input: t, left: (x - tx0) * 256, top: (y - ty0) * 256 })
    }
  const px = (p: LatLon) => {
    const q = worldPx(p, z)
    return { x: q.x - tx0 * 256, y: q.y - ty0 * 256 }
  }
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`,
    ...lines.map((l) => `<polyline fill="none" stroke="${l.color}" stroke-width="4" stroke-linejoin="round" points="${l.path.map((p) => { const q = px(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}` }).join(' ')}"/>`),
    ...points.map((p) => {
      const q = px(p)
      return `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${p.label ? 3 : 7}" fill="${p.color ?? '#ff2d2d'}" stroke="#fff" stroke-width="1.5"/>` +
        (p.label ? `<text x="${(q.x + 5).toFixed(1)}" y="${(q.y - 4).toFixed(1)}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#ffff00" stroke="#000" stroke-width="2.5" paint-order="stroke">${p.label}</text>` : '')
    }),
    '</svg>',
  ].join('')
  layers.push({ input: Buffer.from(svg), left: 0, top: 0 })
  return sharp({ create: { width: w, height: h, channels: 3, background: '#808080' } }).composite(layers).png().toBuffer()
}
