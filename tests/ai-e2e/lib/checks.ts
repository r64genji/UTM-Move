// Deterministic checks. Pure functions: literal data in, list of failure strings out.
export interface LatLon { lat: number; lon: number }

export function distanceM(a: LatLon, b: LatLon): number {
  const R = 6371008.8
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const lengthM = (g: LatLon[]) => g.slice(1).reduce((s, p, i) => s + distanceM(g[i], p), 0)

// ---- places ----

export interface PlaceRow { id: string; name: string; location: LatLon }

/** Ray casting over GeoJSON rings ([lon, lat]); outer ring first, then holes. */
export function inPolygon(p: LatLon, rings: number[][][]): boolean {
  const inRing = (ring: number[][]) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
  return rings.every((ring, i) => (i === 0 ? inRing(ring) : !inRing(ring)))
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function checkPlaces(places: PlaceRow[], boundary: number[][][], dupM = 25): string[] {
  const fails: string[] = []
  const seen = new Set<string>()
  for (const p of places) {
    if (seen.has(p.id)) fails.push(`duplicate id ${p.id}`)
    seen.add(p.id)
    if (!p.name.trim()) fails.push(`${p.id}: empty name`)
    if (!inPolygon(p.location, boundary)) fails.push(`${p.id} "${p.name}": outside the campus boundary`)
  }
  const byName = new Map<string, PlaceRow[]>()
  for (const p of places) byName.set(norm(p.name), [...(byName.get(norm(p.name)) ?? []), p])
  for (const group of byName.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        if (distanceM(group[i].location, group[j].location) <= dupM)
          fails.push(`${group[i].id} and ${group[j].id}: same name "${group[i].name}" within ${dupM} m`)
  return fails
}

// ---- routes ----

export interface LegRow {
  kind: 'walk' | 'bus'
  departAt: string
  arriveAt: string
  geometry: LatLon[]
  /** Bus legs: stop times in order. */
  stops?: { id: string; at: string }[]
}
export interface OptionRow { kind: 'walk' | 'bus'; durationS: number; legs: LegRow[] }

export interface RouteLimits { minWalkKmh: number; maxWalkKmh: number; maxDetour: number; endpointM: number }
export const LIMITS: RouteLimits = { minWalkKmh: 3, maxWalkKmh: 6.5, maxDetour: 2, endpointM: 100 }

export function checkRoute(from: LatLon, to: LatLon, options: OptionRow[], limits: Partial<RouteLimits> = {}): string[] {
  const L = { ...LIMITS, ...limits }
  const fails: string[] = []
  const straight = distanceM(from, to)
  if (!options.some((o) => o.kind === 'walk')) fails.push('no walk-only option')
  options.forEach((o, oi) => {
    const tag = `option ${oi + 1} (${o.kind})`
    let clock = -Infinity
    o.legs.forEach((leg, li) => {
      const dep = Date.parse(leg.departAt)
      const arr = Date.parse(leg.arriveAt)
      if (arr < dep) fails.push(`${tag} leg ${li + 1}: arrives before it departs`)
      if (dep < clock) fails.push(`${tag} leg ${li + 1}: departs before the previous leg arrived`)
      clock = arr
      const m = lengthM(leg.geometry)
      if (leg.kind === 'walk' && m >= 50 && arr > dep) {
        const kmh = (m / ((arr - dep) / 1000)) * 3.6
        if (kmh < L.minWalkKmh || kmh > L.maxWalkKmh) fails.push(`${tag} leg ${li + 1}: walk speed ${kmh.toFixed(1)} km/h`)
      }
      if (leg.kind === 'bus') {
        const s = leg.stops ?? []
        if (s.length < 2) fails.push(`${tag} leg ${li + 1}: bus leg needs a board and an alight stop`)
        else if (s.some((x, i) => i > 0 && Date.parse(x.at) < Date.parse(s[i - 1].at))) fails.push(`${tag} leg ${li + 1}: bus boards after it alights (stop times go backwards)`)
      }
    })
    const first = o.legs[0]?.geometry[0]
    const last = o.legs.at(-1)?.geometry.at(-1)
    if (!first || !last) return fails.push(`${tag}: no geometry`)
    if (distanceM(first, from) > L.endpointM) fails.push(`${tag}: starts ${Math.round(distanceM(first, from))} m from the origin`)
    if (distanceM(last, to) > L.endpointM) fails.push(`${tag}: ends ${Math.round(distanceM(last, to))} m from the destination`)
    if (o.kind === 'walk') {
      const ratio = lengthM(o.legs.flatMap((l) => l.geometry)) / Math.max(straight, 100)
      if (ratio > L.maxDetour) fails.push(`${tag}: detour ratio ${ratio.toFixed(2)} > ${L.maxDetour}`)
    }
  })
  return fails
}
