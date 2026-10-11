import type { LatLon } from '../schemas.ts'
import boundaryJson from '../../../data/campus-boundary.geojson?raw'

/** GeoJSON polygon: outer ring first, then holes. Positions are `[lon, lat]`. */
export type Rings = number[][][]

/** Ray casting. Inside the outer ring and outside every hole. */
export function pointInPolygon(p: LatLon, rings: Rings): boolean {
  return rings.reduce((inside, ring, i) => {
    const hit = inRing(p, ring)
    return i === 0 ? hit : inside && !hit
  }, false)
}

function inRing({ lat, lon }: LatLon, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const campus = JSON.parse(boundaryJson).features[0].geometry.coordinates as Rings

/** Is this point inside the UTM campus boundary? */
export const isOnCampus = (p: LatLon) => pointInPolygon(p, campus)
