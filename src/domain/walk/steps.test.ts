import { expect, test } from 'vitest'
import { buildSteps } from './steps.ts'

const P = (x: number, y: number) => ({ lat: 1.56 + y / 110_574, lon: 103.64 + x / 111_279 })

test('turns, landmarks, buildings and stairs', () => {
  const steps = buildSteps(
    [
      { coords: [P(0, 0), P(0, 100)], lengthM: 100, kind: 'footway', endName: 'FKE P05' },
      { coords: [P(0, 100), P(-50, 100)], lengthM: 50, kind: 'footway' },
      { coords: [P(-50, 100), P(-80, 102)], lengthM: 30, kind: 'road' },
      { coords: [P(-80, 102), P(-120, 102)], lengthM: 40, kind: 'indoor', name: 'Perpustakaan' },
      { coords: [P(-120, 102), P(-120, 130)], lengthM: 28, kind: 'steps', name: 'Perpustakaan' },
      { coords: [P(-120, 130), P(-100, 150)], lengthM: 28, kind: 'footway' },
    ],
    'PSZ',
  )
  expect(steps.map((s) => [s.turn, s.instruction, s.distanceM])).toEqual([
    ['depart', 'Head north', 100],
    ['left', 'Turn left after FKE P05', 80],
    ['straight', 'Go through Perpustakaan', 40],
    ['right', 'Turn right and take the stairs', 28],
    ['slight-right', 'Bear right after Perpustakaan', 28],
    ['arrive', 'Arrive at PSZ', 0],
  ])
})

test('nothing to walk gives no steps', () => {
  expect(buildSteps([])).toEqual([])
})
