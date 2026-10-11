// Stage 1: render downloaded plans to PNG and ask Gemini which pages are indoor floor plans.
// Usage: tsx pipeline/floorplans/triage.ts   (run from repo root; downloads are in data/raw/floorplans/dl/NN.bin)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { askImage, pool } from './gemini.ts'

const DL = 'data/raw/floorplans/dl'
const PNG = 'data/raw/floorplans/png'
mkdirSync(PNG, { recursive: true })
for (const f of readdirSync(DL)) {
  const id = f.replace('.bin', '')
  const type = execFileSync('file', ['-b', `${DL}/${f}`]).toString()
  if (type.startsWith('PDF')) {
    if (!readdirSync(PNG).some((p) => p.startsWith(`${id}-`))) execFileSync('pdftoppm', ['-r', '70', '-png', `${DL}/${f}`, `${PNG}/${id}`])
  } else if (type.startsWith('PNG') || type.startsWith('JPEG')) {
    const ext = type.startsWith('PNG') ? 'png' : 'jpg'
    if (!existsSync(`${PNG}/${id}-1.${ext}`)) writeFileSync(`${PNG}/${id}-1.${ext}`, readFileSync(`${DL}/${f}`))
  }
}

const Reply = z.object({
  kind: z.enum(['floor-plan', 'site-map', 'evacuation-route', 'other']),
  building: z.string().default(''),
  level: z.string().default(''),
  note: z.string().default(''),
})
const PROMPT = `This is one page/image from a document about Universiti Teknologi Malaysia (UTM) Johor Bahru campus.
Classify it. Reply ONLY JSON: {"kind": "floor-plan" (drawn interior plan of ONE building level showing rooms/corridors/doors/stairs), "site-map" (campus or area map of many buildings), "evacuation-route" (floor plan with fire exits/assembly point marked), or "other" (text, photo, table); "building": building name or block code if visible, else ""; "level": e.g. "Ground floor" if visible, else ""; "note": 12 words max}.`

const files = readdirSync(PNG).sort()
const out: Record<string, z.infer<typeof Reply>> = {}
await pool(files, 4, async (f) => {
  const mime = f.endsWith('jpg') ? 'image/jpeg' : 'image/png'
  try {
    out[f] = await askImage(PROMPT, readFileSync(`${PNG}/${f}`), mime, Reply)
  } catch (e) {
    console.warn(f, String(e).slice(0, 100))
  }
})
writeFileSync('data/raw/floorplans/triage.json', JSON.stringify(out, null, 1))
const hits = Object.entries(out).filter(([, v]) => v.kind === 'floor-plan' || v.kind === 'evacuation-route')
console.log(`${files.length} pages, ${hits.length} floor plans / evacuation routes`)
for (const [f, v] of hits) console.log(f, v.kind, '|', v.building, '|', v.level, '|', v.note)
