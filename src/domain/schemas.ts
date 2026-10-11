// Shared data shapes for the pipeline and the app. One source of truth.
import { z } from 'zod'

/** Coordinates are always `{ lat, lon }`. Unknown keys (like `lng`) are rejected. */
export const LatLon = z.strictObject({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
})

const Id = z.string().min(1, 'id must not be empty')
export const HHMM = z.string().regex(/^\d{2}:[0-5]\d$/, 'time must be HH:MM')
export const ISODate = z.iso.date('date must be YYYY-MM-DD')
const Line = z.array(LatLon).min(2, 'a line needs at least 2 points')

export const Category = z.enum([
  'Faculty/Academic',
  'Lab/Workshop',
  'Library',
  'Residential college',
  'Food',
  'Prayer',
  'Sport',
  'Admin/Office',
  'Health',
  'Bank/ATM',
  'Shop/Service',
  'Hall/Event',
  'Parking',
  'Bus stop',
  'Gate/Entrance',
  'Other',
])

/** Who may walk through an indoor item. */
export const Access = z.enum(['public', 'restricted', 'private']).default('public')

export const Weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])

export const OpeningHours = z.array(
  z.object({
    days: z.array(Weekday).min(1),
    open: HHMM,
    close: HHMM,
  }),
)

export const Place = z.object({
  id: Id,
  name: z.string().min(1, 'name must not be empty'),
  aliases: z.array(z.string()).default([]),
  category: Category,
  location: LatLon,
  buildingId: Id.optional(),
  blockCode: z.string().optional(),
  openingHours: OpeningHours.optional(),
  /** Where you walk in: OSM entrances, else the building edge nearest a walkable way. */
  entrances: z.array(LatLon).optional(),
})

export const Building = z.object({
  id: Id,
  name: z.string().optional(),
  blockCode: z.string().optional(),
  outline: z.array(LatLon).min(4, 'a building outline needs at least 4 points'),
  osmId: z.string().optional(),
})

export const Door = z.object({
  id: Id,
  buildingId: Id,
  location: LatLon,
  level: z.number().int().default(0),
  access: Access,
})

export const WalkEdgeKind = z.enum(['footway', 'road', 'steps', 'indoor', 'shortcut'])

export const WalkEdge = z.object({
  id: Id,
  from: Id,
  to: Id,
  kind: WalkEdgeKind,
  geometry: Line,
  lengthM: z.number().positive(),
  climbM: z.number().default(0),
  covered: z.boolean().default(false),
  access: Access,
})

/** verified: used. likely: used with a label. guess: never used. */
export const ShortcutLevel = z.enum(['verified', 'likely', 'guess'])

export const ShortcutKind = z.enum(['footpath', 'covered-walkway', 'stairs', 'through-building', 'bridge'])

/** A possible shortcut, before scoring. `from`/`to` are free-text place hints. */
export const ShortcutCandidate = z.object({
  id: Id,
  geometry: Line,
  kind: ShortcutKind,
  from: z.string().optional(),
  to: z.string().optional(),
  note: z.string().optional(),
})

export const Shortcut = z.object({
  id: Id,
  geometry: Line,
  level: ShortcutLevel,
  kind: ShortcutKind.optional(),
  evidenceIds: z.array(Id).default([]),
  indoor: z.boolean().default(false),
  covered: z.boolean().default(false),
  access: Access,
  note: z.string().optional(),
})

export const EvidenceSource = z.enum([
  'research',
  'satellite',
  'floor-plan',
  'gps-trace',
  'osm',
])

export const Evidence = z.object({
  id: Id,
  shortcutId: Id,
  source: EvidenceSource,
  summary: z.string().min(1, 'summary must not be empty'),
  url: z.url().optional(),
  observedAt: ISODate,
  /** Stable id of the thing observed (trace id, reporter hash, page, tile). Repeats count once. */
  ref: z.string().min(1).optional(),
  /** 0..1. Records below 0.5 do not count when scoring. Missing means 1. */
  confidence: z.number().min(0).max(1).optional(),
  /** Which imagery a `satellite` record was seen on. */
  imagery: z.enum(['esri', 'bing']).optional(),
})

export const Stop = z.object({
  id: Id,
  name: z.string().min(1, 'name must not be empty'),
  location: LatLon,
  /** A real stop outside the UTM boundary (route H's Taman Universiti terminus). */
  offCampus: z.boolean().optional(),
})

export const Route = z.object({
  id: Id,
  name: z.string().min(1, 'name must not be empty'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB').optional(),
})

/** Times are Asia/Kuala_Lumpur wall-clock times. */
export const Trip = z.object({
  id: Id,
  routeId: Id,
  calendarId: Id,
  headsign: z.string().optional(),
  patternId: Id.optional(),
  stopTimes: z
    .array(z.object({ stopId: Id, time: HHMM }))
    .min(2, 'a trip needs at least 2 stop times'),
})

export const Calendar = z.object({
  id: Id,
  days: z.array(Weekday).min(1),
  startDate: ISODate,
  endDate: ISODate,
  exceptions: z
    .array(z.object({ date: ISODate, type: z.enum(['added', 'removed']) }))
    .default([]),
})

/** One stop sequence of a route, with its line as a Google encoded polyline (precision 5). */
export const Pattern = z.object({
  id: Id,
  routeId: Id,
  headsign: z.string().min(1),
  stopIds: z.array(Id).min(2, 'a pattern needs at least 2 stops'),
  shape: z.string().min(1, 'shape must not be empty'),
})

/** The emitted `public/data/transit.json`. */
export const TransitData = z.object({
  stops: z.array(Stop),
  routes: z.array(Route),
  patterns: z.array(Pattern),
  calendars: z.array(Calendar),
  trips: z.array(Trip),
  /** Shown next to departures when the times are carried over from an earlier session. */
  timetableNote: z.string().optional(),
})

export type LatLon = z.infer<typeof LatLon>
export type Category = z.infer<typeof Category>
export type Access = z.infer<typeof Access>
export type Weekday = z.infer<typeof Weekday>
export type OpeningHours = z.infer<typeof OpeningHours>
export type Place = z.infer<typeof Place>
export type Building = z.infer<typeof Building>
export type Door = z.infer<typeof Door>
export type WalkEdge = z.infer<typeof WalkEdge>
export type ShortcutLevel = z.infer<typeof ShortcutLevel>
export type ShortcutKind = z.infer<typeof ShortcutKind>
export type ShortcutCandidate = z.infer<typeof ShortcutCandidate>
export type Shortcut = z.infer<typeof Shortcut>
export type Evidence = z.infer<typeof Evidence>
export type Stop = z.infer<typeof Stop>
export type Route = z.infer<typeof Route>
export type Trip = z.infer<typeof Trip>
export type Calendar = z.infer<typeof Calendar>
export type Pattern = z.infer<typeof Pattern>
export type TransitData = z.infer<typeof TransitData>
