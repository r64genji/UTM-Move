import { create } from 'zustand'
import type { LocationState, StartPoint } from '../location/state.ts'

/** How far the mobile bottom sheet is open. Desktop ignores it (side panel). */
export type SheetSnap = 'peek' | 'half' | 'full'

type AppState = {
  sheet: SheetSnap
  setSheet: (sheet: SheetSnap) => void
  /** Last answer from the device. Written by useUserLocation. */
  location: LocationState
  setLocation: (location: LocationState) => void
  /** Where trips start from (GPS fix, dragged pin, or map tap). null until chosen. */
  start: StartPoint | null
  setStart: (start: StartPoint | null) => void
  /** True while the next map tap sets the start. */
  picking: boolean
  setPicking: (picking: boolean) => void
}

export const useAppStore = create<AppState>()((set) => ({
  sheet: 'half',
  setSheet: (sheet) => set({ sheet }),
  location: { status: 'idle' },
  setLocation: (location) => set({ location }),
  start: null,
  setStart: (start) => set({ start }),
  picking: false,
  setPicking: (picking) => set({ picking }),
}))
