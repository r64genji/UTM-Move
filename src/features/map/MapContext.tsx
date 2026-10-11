import type { Map } from 'maplibre-gl'
import { createContext, useContext, useState, type ReactNode } from 'react'

type Ctx = { map: Map | null; setMap: (map: Map | null) => void }
const MapCtx = createContext<Ctx>({ map: null, setMap: () => {} })

export function MapProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Map | null>(null)
  return <MapCtx.Provider value={{ map, setMap }}>{children}</MapCtx.Provider>
}

/** The loaded map, or null while it loads (or if WebGL is missing). */
export const useMap = () => useContext(MapCtx).map
export const useSetMap = () => useContext(MapCtx).setMap
