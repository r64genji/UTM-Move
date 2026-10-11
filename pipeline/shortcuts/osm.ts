// Is a candidate already in OpenStreetMap? Same rule the vision pass uses to drop "already mapped" lines.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LatLon } from '../../src/domain/schemas.ts'
import { fractionNearWays } from '../vision/filter.ts'

/** A candidate with at least this share of its length within `IN_OSM_M` of an OSM way is in OSM. */
export const IN_OSM_SHARE = 0.7
export const IN_OSM_M = 8

export function readOsmWays(root = 'data'): LatLon[][] {
  const fc = JSON.parse(readFileSync(join(root, 'osm', 'walk-ways.geojson'), 'utf8')) as { features: { geometry: { coordinates: [number, number][] } }[] }
  return fc.features.map((f) => f.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })))
}

export const isInOsm = (line: LatLon[], ways: LatLon[][]): boolean => fractionNearWays(line, ways, IN_OSM_M) >= IN_OSM_SHARE
