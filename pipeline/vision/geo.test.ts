import { describe, expect, it } from 'vitest'
import { lonLatToTile, pixelToLatLon, quadkey, tileToLonLat } from './geo.ts'

describe('web mercator tiles', () => {
  it('tile 0/0/0 north-west corner is (-180, 85.0511)', () => {
    const p = tileToLonLat(0, 0, 0)
    expect(p.lon).toBe(-180)
    expect(p.lat).toBeCloseTo(85.0511287798, 9)
  })
  it('pixel (128,128) of the world tile is the equator at lon 0', () => {
    const p = pixelToLatLon(128, 128, 0, 0, 0)
    expect(p.lat).toBeCloseTo(0, 12)
    expect(p.lon).toBeCloseTo(0, 12)
  })
  it('a pixel in a z19 mosaic round-trips through lonLatToTile', () => {
    const p = pixelToLatLon(300, 100, 400000, 254000, 19)
    const t = lonLatToTile(p, 19)
    expect(t.x).toBeCloseTo(400000 + 300 / 256, 9)
    expect(t.y).toBeCloseTo(254000 + 100 / 256, 9)
  })
  it('quadkey of tile (3,5) at level 3 is 213 (Bing docs)', () => {
    expect(quadkey(3, 5, 3)).toBe('213')
  })
})
