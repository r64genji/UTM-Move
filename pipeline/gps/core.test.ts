import { describe, expect, it } from 'vitest'
import { clusterStretches, followsCandidate, fromXY, LineIndex, offNetworkStretches, parseGpx, walkingRuns, type Pt } from './core.ts'

/** A straight walk east from (x0, y) metres, one fix per second at `mps` m/s. */
const walk = (n: number, mps: number, t0 = 0, x0 = 0, y = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => ({ ...fromXY([x0 + i * mps, y]), t: Date.UTC(2026, 0, 1) + (t0 + i) * 1000 }))
const line = (x0: number, x1: number, y: number) => [fromXY([x0, y]), fromXY([x1, y])]

describe('walkingRuns', () => {
  it('keeps a 1.4 m/s walk as one run', () => {
    const runs = walkingRuns(walk(30, 1.4))
    expect(runs.length).toBe(1)
    expect(runs[0].points.length).toBe(30)
    expect(Math.round(runs[0].speedsKmh[15] * 10) / 10).toBe(5)
  })
  it('drops a 10 m/s (36 km/h) vehicle track', () => {
    expect(walkingRuns(walk(30, 10))).toEqual([])
  })
  it('drops a standing-still track (0.2 m/s)', () => {
    expect(walkingRuns(walk(30, 0.2))).toEqual([])
  })
  it('drops untimed points', () => {
    expect(walkingRuns(walk(30, 1.4).map(({ lat, lon }) => ({ lat, lon })))).toEqual([])
  })
  it('splits walk then vehicle: only the walking part survives', () => {
    const mixed = [...walk(30, 1.4), ...walk(30, 10, 30, 42)]
    const runs = walkingRuns(mixed)
    expect(runs.length).toBe(1)
    expect(runs[0].points.length).toBe(27) // the 3 fixes next to the vehicle part average in its speed
  })
})

describe('offNetworkStretches', () => {
  const road = new LineIndex([line(0, 200, 0)])
  it('finds the part of a walk more than 25 m from the road', () => {
    // 100 points at 1.4 m/s along y=60: 60 m from the road
    const out = offNetworkStretches(walk(100, 1.4, 0, 0, 60), road)
    expect(out.length).toBe(1)
    expect(out[0].length).toBe(100)
  })
  it('ignores a walk beside the road and a too-short detour', () => {
    expect(offNetworkStretches(walk(100, 1.4, 0, 0, 5), road)).toEqual([])
    expect(offNetworkStretches(walk(10, 1.4, 0, 0, 60), road)).toEqual([])
  })
})

describe('clusterStretches', () => {
  it('groups two tracks on one line and keeps a far line apart', () => {
    const a = walk(60, 1.4, 0, 0, 60).map(({ lat, lon }) => ({ lat, lon }))
    const b = walk(60, 1.4, 0, 3, 64).map(({ lat, lon }) => ({ lat, lon }))
    const c = walk(60, 1.4, 0, 0, 200).map(({ lat, lon }) => ({ lat, lon }))
    const clusters = clusterStretches([{ trackId: 't1', line: a }, { trackId: 't2', line: b }, { trackId: 't3', line: c }])
    expect(clusters.map((x) => x.trackIds.sort())).toEqual([['t1', 't2'], ['t3']])
  })
  it('counts one track once', () => {
    const a = walk(60, 1.4, 0, 0, 60).map(({ lat, lon }) => ({ lat, lon }))
    expect(clusterStretches([{ trackId: 't1', line: a }, { trackId: 't1', line: a }])[0].trackIds).toEqual(['t1'])
  })
})

describe('followsCandidate', () => {
  const candidate = line(10, 80, 0)
  it('is true when the walk covers the candidate, false when it covers half', () => {
    expect(followsCandidate(new LineIndex([line(0, 100, 3)]), candidate)).toBe(true)
    expect(followsCandidate(new LineIndex([line(0, 40, 3)]), candidate)).toBe(false)
    expect(followsCandidate(new LineIndex([line(0, 100, 30)]), candidate)).toBe(false)
  })
})

describe('parseGpx', () => {
  const xml = `<gpx><trk><name>a</name><url>/user/x/traces/42</url><trkseg>
<trkpt lat="1.5" lon="103.6"><time>2026-01-01T00:00:00Z</time></trkpt>
<trkpt lat="1.6" lon="103.7"/></trkseg></trk>
<trk><trkseg><trkpt lat="1.1" lon="103.1"><time>2026-01-01T00:00:01Z</time></trkpt></trkseg></trk>
<trk><url>/user/x/traces/42</url><trkseg><trkpt lat="1.7" lon="103.8"/></trkseg></trk></gpx>`
  it('reads ids, times, and merges segments of one trace', () => {
    const t = parseGpx(xml, 'page-3')
    expect(t.map((x) => x.id)).toEqual(['osm-trace-42', 'page-3#1'])
    expect(t[0].url).toBe('https://www.openstreetmap.org/user/x/traces/42')
    expect(t[0].segments).toEqual([
      [{ lat: 1.5, lon: 103.6, t: 1767225600000 }, { lat: 1.6, lon: 103.7 }],
      [{ lat: 1.7, lon: 103.8 }],
    ])
  })
})
