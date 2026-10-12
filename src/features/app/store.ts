import { create } from 'zustand'
import type { LocationState, StartPoint } from '../location/state.ts'

type AppState = {
  /** Last answer from the device. Written by useUserLocation. */
  location: LocationState
  setLocation: (location: LocationState) => void
  /** Where trips start from (GPS fix, dragged pin, or map tap). null until chosen. */
  start: StartPoint | null
  setStart: (start: StartPoint | null) => void
  /** True while the next map tap sets the start. */
  picking: boolean
  setPicking: (picking: boolean) => void
  /** Draw every bus stop on the map ("Stops" chip, "Show All Stops"). */
  showStops: boolean
  setShowStops: (showStops: boolean) => void
}

export const useAppStore = create<AppState>()((set) => ({
  location: { status: 'idle' },
  setLocation: (location) => set({ location }),
  start: null,
  setStart: (start) => set({ start }),
  picking: false,
  setPicking: (picking) => set({ picking }),
  showStops: false,
  setShowStops: (showStops) => set({ showStops }),
}))
