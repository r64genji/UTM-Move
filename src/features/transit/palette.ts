/** One colour per route letter. The timetable's own colours are placeholders; these are the ones students know. */
const ROUTE_COLORS: Record<string, string> = {
  A: '#EF4444',
  B: '#F59E0B',
  C: '#10B981',
  D: '#3B82F6',
  E: '#8B5CF6',
  F: '#EC4899',
  G: '#14B8A6',
  H: '#06B6D4',
  J: '#F97316',
}

export const routeColor = (id: string, fallback = '#6B7280') => ROUTE_COLORS[id] ?? fallback
