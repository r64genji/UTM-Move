import { describe, expect, it } from 'vitest'
import { dropReason, fractionNearWays, metresInsideBuildings } from './filter.ts'

// 0.0001 deg lat = 11.1 m. Points at lon 103.6.
const p = (lat: number, lon: number) => ({ lat, lon })
const way = [p(1.56, 103.6), p(1.56, 103.601)] // ~111 m east-west
const buildings = [[p(1.5601, 103.6004), p(1.5601, 103.6006), p(1.5603, 103.6006), p(1.5603, 103.6004), p(1.5601, 103.6004)]] // ~22 m square

describe('vision filter', () => {
  it('a line 4 m beside a mapped way is entirely near it', () => {
    expect(fractionNearWays([p(1.560036, 103.6002), p(1.560036, 103.6008)], [way])).toBe(1)
  })
  it('a line 40 m away is not near it', () => {
    expect(fractionNearWays([p(1.56036, 103.6002), p(1.56036, 103.6008)], [way])).toBe(0)
  })
  it('a line that follows the way for 1/3 of its length is kept', () => {
    // runs 100 m east along the way, then 200 m north away from it
    const f = fractionNearWays([p(1.56, 103.6), p(1.56, 103.6009), p(1.5618, 103.6009)], [way])
    expect(f).toBeGreaterThan(0.3)
    expect(f).toBeLessThan(0.4)
  })
  it('counts about 22.5 m of a line crossing the building', () => {
    expect(metresInsideBuildings([p(1.5602, 103.6), p(1.5602, 103.601)], buildings)).toBeCloseTo(22.5, 0)
  })
  it('drops mapped lines and interior crossings, but not through-building or bridge', () => {
    const cross = [p(1.5602, 103.6), p(1.5602, 103.6002)] // short, away from way, no building
    const through = [p(1.5602, 103.6003), p(1.5602, 103.6007)] // 44 m, 22 m off the way, ~22 m inside
    expect(dropReason('footpath', [p(1.560036, 103.6002), p(1.560036, 103.6008)], [way], buildings)).toBe('already-mapped')
    expect(dropReason('footpath', cross, [way], buildings)).toBeUndefined()
    expect(dropReason('footpath', through, [way], buildings)).toBe('through-building-interior')
    expect(dropReason('through-building', through, [way], buildings)).toBeUndefined()
    expect(dropReason('bridge', through, [way], buildings)).toBeUndefined()
    expect(dropReason('footpath', through, [way], undefined)).toBeUndefined()
  })
})
