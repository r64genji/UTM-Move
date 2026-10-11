// Ground height from a small committed grid cropped from Copernicus GLO-30 (data/osm/dem-grid.json).
export interface DemGrid {
  /** Centre of the north-west pixel. */
  west: number
  north: number
  /** Pixel size in degrees. */
  dLon: number
  dLat: number
  cols: number
  rows: number
  /** base64 of little-endian Int16, decimetres, row-major from the north. */
  dm: string
}

export function decodeDem(g: DemGrid): (lat: number, lon: number) => number {
  const raw = Buffer.from(g.dm, 'base64')
  const z = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
  const at = (c: number, r: number) => z[Math.min(g.rows - 1, Math.max(0, r)) * g.cols + Math.min(g.cols - 1, Math.max(0, c))] / 10
  return (lat, lon) => {
    const x = (lon - g.west) / g.dLon
    const y = (g.north - lat) / g.dLat
    const c = Math.floor(x)
    const r = Math.floor(y)
    const fx = x - c
    const fy = y - r
    return (
      at(c, r) * (1 - fx) * (1 - fy) + at(c + 1, r) * fx * (1 - fy) + at(c, r + 1) * (1 - fx) * fy + at(c + 1, r + 1) * fx * fy
    )
  }
}
