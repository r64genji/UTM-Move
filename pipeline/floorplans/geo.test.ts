import { describe, expect, it } from 'vitest'
import { bestFit, fitOutline, type XY } from './geo.ts'

// A 40 x 15 m building in local metres, and the same shape as plan pixels (y down, 0.1 m/px, rotated 90 degrees).
const osm: XY[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 15 }, { x: 0, y: 15 }]
const plan: XY[] = [{ x: 150, y: 0 }, { x: 150, y: 400 }, { x: 0, y: 400 }, { x: 0, y: 0 }]

describe('fitOutline', () => {
  it('maps plan pixels onto the OSM outline with a unique pose', () => {
    expect(bestFit(fitOutline(plan, osm)).reason).toMatch(/ambiguous/) // a plain rectangle fits 180 degrees apart too
    const lshape: XY[] = [...osm.slice(0, 2), { x: 40, y: 8 }, { x: 22, y: 8 }, { x: 22, y: 15 }, { x: 0, y: 15 }]
    const planL = lshape.map((p) => ({ x: -p.y * 10, y: -p.x * 10 }))
    const best = bestFit(fitOutline(planL, lshape))
    expect(best.reason).toBeUndefined()
    const door = best.fit!.apply(planL[1])
    expect([door.x, door.y].map((v) => Math.round(v))).toEqual([40, 0])
  })
  it('rejects a plan whose size does not match any outline', () => {
    expect(bestFit(fitOutline(plan, osm.map((p) => ({ x: p.x * 3, y: p.y * 3 })))).fit).toBeUndefined()
  })
})
