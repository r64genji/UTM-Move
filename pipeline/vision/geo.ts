// Web Mercator tile math for the satellite vision pass.
import type { LatLon } from '../../src/domain/schemas.ts'

export const TILE = 256

/** Fractional tile coordinates of a point at zoom z. */
export function lonLatToTile(p: LatLon, z: number): { x: number; y: number } {
  const n = 2 ** z
  const s = Math.sin((p.lat * Math.PI) / 180)
  return { x: ((p.lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }
}

/** Lat/lon of a (possibly fractional) tile coordinate; the north-west corner of tile (x, y) at integer input. */
export function tileToLonLat(x: number, y: number, z: number): LatLon {
  const n = 2 ** z
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI, lon: (x / n) * 360 - 180 }
}

/** Lat/lon of pixel (px, py) in a mosaic whose top-left tile is (x0, y0). */
export function pixelToLatLon(px: number, py: number, x0: number, y0: number, z: number): LatLon {
  return tileToLonLat(x0 + px / TILE, y0 + py / TILE, z)
}

/** Bing quadkey of a tile. */
export function quadkey(x: number, y: number, z: number): string {
  let q = ''
  for (let i = z; i > 0; i--) {
    const m = 1 << (i - 1)
    q += (x & m ? 1 : 0) + (y & m ? 2 : 0)
  }
  return q
}
