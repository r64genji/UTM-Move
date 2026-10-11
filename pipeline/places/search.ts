// #26: build the MiniSearch index from places.json + the transit stops. `npm run build:search`
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { buildIndex } from '../../src/domain/search.ts'
import { Place, Stop } from '../../src/domain/schemas.ts'

const places = z.array(Place).parse(JSON.parse(readFileSync('public/data/places.json', 'utf8')))
const stops = z.array(Stop).parse(JSON.parse(readFileSync('public/data/transit.json', 'utf8')).stops)
writeFileSync('public/data/search-index.json', JSON.stringify(buildIndex(places, stops)))
console.log(`search index: ${places.length} places + ${stops.length} stops -> public/data/search-index.json`)
