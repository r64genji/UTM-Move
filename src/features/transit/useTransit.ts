import { useEffect, useState } from 'react'
import { dataUrl } from '../../dataUrl.ts'
import { TransitData } from '../../domain/schemas.ts'

let cached: Promise<TransitData> | null = null

/** Fetch and validate `/data/transit.json` once. Pages and the worker share the same promise. */
export function loadTransit(url = dataUrl('transit.json')): Promise<TransitData> {
  cached ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`transit.json: HTTP ${r.status}`)
      return r.json()
    })
    .then((json) => TransitData.parse(json))
    .catch((e) => {
      cached = null
      throw e
    })
  return cached
}

export type TransitState = { data: TransitData | null; error: boolean }

export function useTransit(): TransitState {
  const [state, setState] = useState<TransitState>({ data: null, error: false })
  useEffect(() => {
    let live = true
    loadTransit().then(
      (data) => live && setState({ data, error: false }),
      () => live && setState({ data: null, error: true }),
    )
    return () => void (live = false)
  }, [])
  return state
}

/** The current time, refreshed every `ms`. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
