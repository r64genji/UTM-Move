import { useEffect, useState } from 'react'
import type MiniSearch from 'minisearch'
import { dataUrl } from '../../dataUrl.ts'
import { loadIndex, type SearchDoc } from '../../domain/search.ts'

let indexPromise: Promise<MiniSearch<SearchDoc> | null> | null = null

/** The offline search index (public/data/search-index.json), loaded once. Null while loading or if it is missing. */
export function useSearchIndex(): MiniSearch<SearchDoc> | null {
  const [index, setIndex] = useState<MiniSearch<SearchDoc> | null>(null)
  useEffect(() => {
    let live = true
    indexPromise ??= fetch(dataUrl('search-index.json'))
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => (t ? loadIndex(t) : null))
      .catch(() => null)
    indexPromise.then((i) => live && setIndex(i))
    return () => void (live = false)
  }, [])
  return index
}
