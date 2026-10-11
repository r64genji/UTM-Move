# Shortcut evidence and scoring

A **candidate** is a line that might be a walking shortcut. Each source adds **evidence**
records for candidates. `npm run score:shortcuts` turns the evidence into a **level**.

| Level | Meaning in the app |
|---|---|
| `verified` | used for routing |
| `likely` | used, with a "likely shortcut" label |
| `guess` | never used |

Code: `pipeline/shortcuts/` (`store.ts` writes, `score.ts` scores, `score-cli.ts` is the CLI).
Schemas: `ShortcutCandidate`, `Evidence`, `Shortcut` in `src/domain/schemas.ts`.

## Writing: use `store.ts`, do not edit the files by hand

```ts
import { addCandidate, appendEvidence } from '../shortcuts/store.ts'

const { id } = addCandidate({
  kind: 'stairs',
  geometry: [{ lat: 1.5589, lon: 103.6387 }, { lat: 1.5595, lon: 103.6392 }],
  from: 'N28a',
  to: 'Arked Meranti',
})
appendEvidence({
  shortcutId: id,
  source: 'gps-trace',
  ref: 'osm-trace-123456',
  summary: 'GPX trace walks the full line',
  url: 'https://www.openstreetmap.org/user/x/traces/123456',
  observedAt: '2026-10-11',
  confidence: 0.9,
})
```

- `addCandidate` merges a line into an existing candidate when the two lines are within
  **10 m Hausdorff distance** (direction does not matter). It returns the existing id and
  `merged: true`, and fills in `from`/`to`/`note` if the existing one had none.
  Always attach evidence to the id it returns.
- `appendEvidence` validates the record with zod and throws on bad input. The default id is a
  hash of `(shortcutId, source, ref or summary, imagery)`, so re-running a script does not
  add duplicates (`added: false`).
- Both take an optional last argument `root` (default `data`) for tests.
- Writes take a lock file, so parallel scripts in one checkout are safe.
- Run scripts from the repo root.

## `data/shortcuts/candidates.geojson`

GeoJSON `FeatureCollection`, one feature per line (keeps git merges simple).
Coordinates are GeoJSON `[lon, lat]` in the file; the store converts them to `{ lat, lon }`.

| property | type | notes |
|---|---|---|
| `id` | string | `sc-<hash>` from kind + geometry unless you pass one |
| `kind` | `footpath` \| `covered-walkway` \| `stairs` \| `through-building` \| `bridge` | |
| `from`, `to` | string, optional | free-text place hints, e.g. `N28a`, `Arked Meranti` |
| `note` | string, optional | |

## `data/evidence/<source>.jsonl`

One JSON record per line, one file per source. One record = one claim about one candidate.

| field | type | notes |
|---|---|---|
| `id` | string | default `ev-<hash>` |
| `shortcutId` | string | candidate id |
| `source` | `research` \| `satellite` \| `floor-plan` \| `gps-trace` \| `user-report` \| `osm` | |
| `summary` | string | one line, human readable |
| `url` | URL, optional | |
| `observedAt` | `YYYY-MM-DD` | when the claim was seen |
| `ref` | string, optional | stable id of what was observed: trace id, reporter hash, page, tile. Records with the same `ref` count once |
| `confidence` | 0..1, optional | missing = 1. Below 0.5 is ignored by scoring |
| `imagery` | `esri` \| `bing`, optional | set it on `satellite` records |

Who writes what:

| Ticket | source | `ref` should be |
|---|---|---|
| #14 research | `research` | page URL |
| #15 vision | `satellite` (+ `imagery`) | `esri:z/x/y` or `bing:quadkey` |
| #16 floor plans | `floor-plan` | plan file name + page |
| #17 GPS | `gps-trace` | trace id |
| #30 user reports | `user-report` | hashed reporter id (never a raw name or email) |
| OSM import | `osm` | `way/<id>` |

Only record evidence that **supports** a shortcut, with one exception: "did not work" answers from users
go to `data/evidence/user-negative.jsonl` (`appendNegative` / `readNegatives` in `store.ts`; `readEvidence` skips that file).
`pipeline/shortcuts/import_form.ts` writes both from the Google Form's response sheet.

## Scoring rules (`pipeline/shortcuts/score.ts`)

Records with `confidence < 0.5` are dropped first. Counts are distinct `ref` values (or `id` when there is no `ref`).
First rule: if there is at least one negative and negatives >= supporting records, the level is **guess**.

- **verified**: any `osm` record, or 2+ `gps-trace` records, or 3+ `user-report` records.
- **likely**: 2+ independent sources (two different `source` values), or `satellite` records on both `esri` and `bing`.
- **guess**: anything else, including no evidence.

## `npm run score:shortcuts [dataDir]`

Writes:

- `data/shortcuts/scored.geojson`: one feature per candidate, with `Shortcut` properties
  (`id`, `level`, `kind`, `evidenceIds`, `indoor`, `covered`, `access`) plus `from`, `to`, `reasons`.
  `through-building` is `indoor` and `covered`; `covered-walkway` is `covered`.
- `data/raw/reports/shortcuts.html`: MapLibre map on Esri imagery, lines coloured by level
  (green verified, amber likely, red guess). Click a line for its reasons and evidence ids.

Evidence for an unknown `shortcutId` is reported as a warning and ignored.
