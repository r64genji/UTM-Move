// Offline place search. The index is built in the pipeline (pipeline/places/search.ts) and loaded here
// with the same options, so build and app agree on fields and tokenizing.
import MiniSearch, { type Options } from 'minisearch'
import type { Category, Place, Stop } from './schemas.ts'

/** English and Malay words people type for each category. Indexed, so "perpus" finds Library places. */
export const CATEGORY_WORDS: Record<Category, string> = {
  'Faculty/Academic': 'faculty fakulti academic akademik school fakulti',
  'Lab/Workshop': 'lab laboratory workshop makmal bengkel',
  Library: 'library perpustakaan perpus',
  'Residential college': 'college kolej residential hostel kediaman',
  Food: 'food cafe kafe kafeteria cafeteria kedai makan restaurant restoran',
  Prayer: 'mosque masjid surau prayer',
  Sport: 'sport sports sukan gym stadium gelanggang court',
  'Admin/Office': 'office pejabat admin',
  Health: 'clinic klinik health kesihatan pusat kesihatan',
  'Bank/ATM': 'bank atm',
  'Shop/Service': 'shop kedai service perkhidmatan store',
  'Hall/Event': 'hall dewan event',
  Parking: 'parking parkir letak kereta',
  'Bus stop': 'bus stop bas hentian',
  'Gate/Entrance': 'gate entrance pintu masuk gerbang',
  Other: '',
}

export type SearchDoc = {
  id: string
  kind: 'place' | 'stop'
  ref: string
  name: string
  aliases: string
  code: string
  words: string
  category: Category
  lat: number
  lon: number
}

export type SearchHit = Pick<SearchDoc, 'id' | 'kind' | 'ref' | 'name' | 'category' | 'code' | 'lat' | 'lon'>

export const SEARCH_OPTIONS: Options<SearchDoc> = {
  fields: ['name', 'aliases', 'code', 'words'],
  storeFields: ['kind', 'ref', 'name', 'category', 'code', 'aliases', 'lat', 'lon'],
  tokenize: (s) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean),
  processTerm: (t) => t.toLowerCase(),
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function searchDocs(places: Place[], stops: Stop[]): SearchDoc[] {
  return [
    ...places.map((p): SearchDoc => ({
      id: `place:${p.id}`, kind: 'place', ref: p.id, name: p.name, aliases: p.aliases.join('|'), code: p.blockCode ?? '',
      words: CATEGORY_WORDS[p.category], category: p.category, ...p.location,
    })),
    ...stops.map((s): SearchDoc => ({
      id: `stop:${s.id}`, kind: 'stop', ref: s.id, name: s.name, aliases: '', code: s.id,
      words: CATEGORY_WORDS['Bus stop'], category: 'Bus stop', ...s.location,
    })),
  ]
}

export function buildIndex(places: Place[], stops: Stop[]): MiniSearch<SearchDoc> {
  const index = new MiniSearch<SearchDoc>(SEARCH_OPTIONS)
  index.addAll(searchDocs(places, stops))
  return index
}

export function loadIndex(json: string): MiniSearch<SearchDoc> {
  return MiniSearch.loadJSON<SearchDoc>(json, SEARCH_OPTIONS)
}

/** Best matches first. An exact block code, alias or name beats everything; typos still match. */
export function search(index: MiniSearch<SearchDoc>, query: string, category?: Category | null, limit = 20): SearchHit[] {
  const q = norm(query)
  if (!q) return []
  const run = (combineWith: 'AND' | 'OR') =>
    index.search(query, {
      combineWith, prefix: true, fuzzy: (t) => (t.length > 3 ? 0.2 : false),
      boost: { name: 2, aliases: 3, code: 4, words: 0.5 },
      filter: category ? (r) => r.category === category : undefined,
    })
  let results = run('AND')
  if (!results.length) results = run('OR')
  return results
    .map((r) => {
      const aliases = String(r.aliases).split('|').map(norm)
      // An exact block code or name, or a place's first alias (its usual abbreviation), beats everything.
      const exact = (r.code && norm(r.code) === q) || norm(r.name) === q || aliases[0] === q ? 1000 : aliases.includes(q) ? 500 : 0
      // A word of the name itself matched, not just a category word or an alias.
      const inName = Object.values(r.match).filter((f) => f.includes('name')).length * 20
      return { r, score: r.score + exact + inName - String(r.name).length * 0.01 }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r }) => ({ id: r.id, kind: r.kind, ref: r.ref, name: r.name, category: r.category, code: r.code, lat: r.lat, lon: r.lon }))
}
