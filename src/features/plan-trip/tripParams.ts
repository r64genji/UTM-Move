// Trip state lives in the URL (/plan?from=…&to=…), so a trip link can be shared.

export type Endpoint =
  | { kind: 'me' }
  | { kind: 'place'; id: string }
  | { kind: 'stop'; id: string }
  | { kind: 'point'; lat: number; lon: number }

export type When = { type: 'now' } | { type: 'depart' | 'arrive'; time: string } // time: 'YYYY-MM-DDTHH:MM', Asia/Kuala_Lumpur

export type Profile = 'fastest' | 'sheltered' | 'no-stairs'

export type Trip = { from: Endpoint | null; to: Endpoint | null; when: When; profile: Profile }

const PROFILES: Profile[] = ['fastest', 'sheltered', 'no-stairs']

export function parseEndpoint(s: string | null): Endpoint | null {
  if (!s) return null
  if (s === 'me') return { kind: 'me' }
  const [kind, rest] = [s.slice(0, s.indexOf(':')), s.slice(s.indexOf(':') + 1)]
  if ((kind === 'place' || kind === 'stop') && rest) return { kind, id: rest }
  if (kind === 'pt') {
    const [lat, lon] = rest.split(',').map(Number)
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { kind: 'point', lat, lon }
  }
  return null
}

export function formatEndpoint(e: Endpoint): string {
  switch (e.kind) {
    case 'me':
      return 'me'
    case 'point':
      return `pt:${e.lat.toFixed(6)},${e.lon.toFixed(6)}`
    default:
      return `${e.kind}:${e.id}`
  }
}

export function parseTrip(params: URLSearchParams): Trip {
  const at = params.get('at')
  const type = params.get('when')
  const profile = params.get('profile') as Profile
  return {
    from: parseEndpoint(params.get('from')),
    to: parseEndpoint(params.get('to')),
    when: (type === 'depart' || type === 'arrive') && at ? { type, time: at } : { type: 'now' },
    profile: PROFILES.includes(profile) ? profile : 'fastest',
  }
}

export function tripSearch(trip: Trip): string {
  const p = new URLSearchParams()
  if (trip.from) p.set('from', formatEndpoint(trip.from))
  if (trip.to) p.set('to', formatEndpoint(trip.to))
  if (trip.when.type !== 'now') {
    p.set('when', trip.when.type)
    p.set('at', trip.when.time)
  }
  if (trip.profile !== 'fastest') p.set('profile', trip.profile)
  return `?${p}`
}
