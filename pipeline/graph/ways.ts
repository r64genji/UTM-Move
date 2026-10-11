// Which OSM ways people can walk, and what kind of edge they become. Used by extract.ts.
import type { EdgeKind } from '../../src/domain/walk/graph.ts'

export type OsmTags = Record<string, unknown>

/** What the snapshot keeps per way. `grade`: bridge or tunnel, so the DEM (ground height) is ignored for climb. */
export interface WayProps {
  kind: EdgeKind
  sheltered?: boolean
  stepFree?: boolean
  grade?: boolean
  name?: string
}

const FOOT_OK = new Set(['yes', 'designated', 'permissive'])
const ROAD = new Set(['residential', 'service', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'unclassified', 'living_street'])
const FOOTWAY = new Set(['footway', 'pedestrian', 'corridor', 'cycleway'])

/** Returns null for ways nobody should be routed over. */
export function classifyWay(t: OsmTags): WayProps | null {
  const hw = String(t.highway ?? '')
  const foot = String(t.foot ?? '')
  const access = String(t.access ?? '')
  if (t.area === 'yes') return null
  if (foot === 'no') return null
  if ((access === 'private' || access === 'no') && !FOOT_OK.has(foot)) return null

  const covered = t.covered === 'yes' || t.tunnel === 'building_passage' || t.indoor === 'yes' || t.indoor === 'corridor'
  const grade = (t.bridge !== undefined && t.bridge !== 'no') || (t.tunnel !== undefined && t.tunnel !== 'no')
  const sheltered = covered || t.tunnel === 'yes'
  const base = { ...(sheltered ? { sheltered: true } : {}), ...(grade ? { grade: true } : {}), ...(t.name ? { name: String(t.name) } : {}) }

  if (hw === 'steps') return { kind: 'steps', stepFree: false, ...base }
  if (FOOTWAY.has(hw) || hw === 'path' || hw === 'track') {
    let kind: EdgeKind = hw === 'path' || hw === 'track' ? 'path' : 'footway'
    if (t.footway === 'crossing' || t.highway === 'crossing') kind = 'crossing'
    else if (t.ramp === 'yes') kind = 'ramp'
    else if (covered) kind = 'covered'
    return { kind, stepFree: true, ...base }
  }
  if (ROAD.has(hw)) return { kind: 'road', stepFree: true, ...base }
  return null
}
