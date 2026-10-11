// Turn-by-turn steps from a walked line. Pure: no graph, no DOM. Used by the planner and live navigation (#28).
import type { LatLon } from '../schemas.ts'
import { bearing } from './geo.ts'
import type { EdgeKind } from './graph.ts'

/** One walked edge (or part of one), in walking order. */
export interface StepEdge {
  coords: LatLon[]
  lengthM: number
  kind: EdgeKind
  /** Building or walkway name of this edge. */
  name?: string
  /** Landmark at the junction where this edge ends. */
  endName?: string
}

export type Turn =
  | 'depart' | 'straight' | 'slight-left' | 'left' | 'sharp-left'
  | 'slight-right' | 'right' | 'sharp-right' | 'arrive'

export interface Step {
  turn: Turn
  instruction: string
  /** Where the step starts. */
  location: LatLon
  /** Metres to walk from here to the next step. */
  distanceM: number
}

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
const TURN_TEXT: Record<string, string> = {
  'slight-left': 'Bear left', left: 'Turn left', 'sharp-left': 'Turn sharp left',
  'slight-right': 'Bear right', right: 'Turn right', 'sharp-right': 'Turn sharp right',
}

/** Signed turn angle from bearing a to bearing b, -180..180, positive is right. */
const delta = (a: number, b: number) => ((b - a + 540) % 360) - 180

export function turnFor(angle: number): Turn {
  const abs = Math.abs(angle)
  if (abs < 25) return 'straight'
  const side = angle < 0 ? 'left' : 'right'
  if (abs < 60) return `slight-${side}`
  if (abs < 135) return side
  return `sharp-${side}`
}

function headings(coords: LatLon[]): [first: number, last: number] | null {
  const pts = coords.filter((p, i) => i === 0 || p.lat !== coords[i - 1].lat || p.lon !== coords[i - 1].lon)
  if (pts.length < 2) return null
  return [bearing(pts[0], pts[1]), bearing(pts[pts.length - 2], pts[pts.length - 1])]
}

const isBuilding = (e: StepEdge) => e.kind === 'indoor' || e.kind === 'door'

/**
 * Steps for a walk. A new step starts on a turn, when entering a named building, or at stairs.
 * Straight-on junctions are folded into the current step.
 */
export function buildSteps(edges: StepEdge[], destination?: string): Step[] {
  const walked = edges.filter((e) => headings(e.coords))
  if (!walked.length) return []
  const [startBearing] = headings(walked[0].coords)!
  const first = walked[0]
  let text = `Head ${COMPASS[Math.round(startBearing / 45) % 8]}`
  if (first.kind === 'steps') text += ' up the stairs'
  else if (isBuilding(first) && first.name) text += ` through ${first.name}`
  const steps: Step[] = [{ turn: 'depart', instruction: text, location: first.coords[0], distanceM: first.lengthM }]

  for (let i = 1; i < walked.length; i++) {
    const prev = walked[i - 1]
    const cur = walked[i]
    const turn = turnFor(delta(headings(prev.coords)![1], headings(cur.coords)![0]))
    const entering = isBuilding(cur) && cur.name !== undefined && cur.name !== prev.name
    const stairs = cur.kind === 'steps' && prev.kind !== 'steps'
    if (turn === 'straight' && !entering && !stairs) {
      steps[steps.length - 1].distanceM += cur.lengthM
      continue
    }
    const landmark = prev.endName ?? (prev.name !== cur.name ? prev.name : undefined)
    const turnText = TURN_TEXT[turn]
    if (entering) text = turnText ? `${turnText} into ${cur.name}` : `Go through ${cur.name}`
    else if (stairs) text = turnText ? `${turnText} and take the stairs` : 'Take the stairs'
    else text = landmark ? `${turnText} after ${landmark}` : turnText
    steps.push({ turn, instruction: text, location: cur.coords[0], distanceM: cur.lengthM })
  }

  const last = walked[walked.length - 1]
  const name = destination ?? last.endName
  steps.push({
    turn: 'arrive',
    instruction: name ? `Arrive at ${name}` : 'Arrive',
    location: last.coords[last.coords.length - 1],
    distanceM: 0,
  })
  return steps
}
