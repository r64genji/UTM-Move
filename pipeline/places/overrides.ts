// data/overrides/places.yaml: review decisions, applied on every build.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { Category, LatLon } from '../../src/domain/schemas.ts'

export const OVERRIDES = 'data/overrides/places.yaml'

export const Decision = z.strictObject({
  /** keep: as Gemini cleaned it. fix: keep with the given fields. drop: hide. merge: fold into `mergeInto`. */
  action: z.enum(['keep', 'fix', 'drop', 'merge']),
  name: z.string().min(1).optional(),
  category: Category.optional(),
  aliases: z.array(z.string()).optional(),
  location: LatLon.optional(),
  mergeInto: z.string().optional(),
  by: z.enum(['agent', 'user']),
  note: z.string().optional(),
}).refine((d) => d.action !== 'merge' || !!d.mergeInto, 'merge needs mergeInto')
export type Decision = z.infer<typeof Decision>

export const Overrides = z.record(z.string(), Decision)
export type Overrides = z.infer<typeof Overrides>

const HEADER = `# Place review decisions (#11). Applied on every \`npm run build:places\`.
# Key: candidate id (osm-w123 = OSM way, osm-n123 = OSM node, g-xxxxxxxxxx = hashed Google place).
# action: keep | fix (name/category/aliases/location) | drop | merge (mergeInto: <id>)
# by: agent = first pass by the coding agent, user = you. Change anything you disagree with.
`

export function loadOverrides(path = OVERRIDES): Overrides {
  if (!existsSync(path)) return {}
  return Overrides.parse(parse(readFileSync(path, 'utf8')) ?? {})
}

export function saveOverrides(o: Overrides, path = OVERRIDES): void {
  const sorted = Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(path, HEADER + stringify(sorted, { lineWidth: 0 }))
}
