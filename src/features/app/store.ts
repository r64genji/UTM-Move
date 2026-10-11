import { create } from 'zustand'

/** How far the mobile bottom sheet is open. Desktop ignores it (side panel). */
export type SheetSnap = 'peek' | 'half' | 'full'

type AppState = {
  sheet: SheetSnap
  setSheet: (sheet: SheetSnap) => void
}

export const useAppStore = create<AppState>()((set) => ({
  sheet: 'half',
  setSheet: (sheet) => set({ sheet }),
}))
