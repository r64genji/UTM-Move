# UTM Move

Campus navigator for Universiti Teknologi Malaysia: walking and campus bus
directions. v2 runs fully in the browser. There is no backend.

v1 (Express + GraphHopper) is at tag `v1`.

## Stack

Vite, React 19, TypeScript (strict), MapLibre + PMTiles, React Router,
Zustand, Comlink (router Web Worker), MiniSearch, kdbush, zod, Vitest,
Playwright.

## Run

```sh
npm ci
npm run dev        # dev server
npm run lint
npm run typecheck
npm test
npm run validate   # data checks (stub for now)
npm run build      # output in dist/
```

## Layout

```
src/domain/     pure TS: geo, transit, walk, router, search, time, schemas
src/features/   app screens
src/ui/         shared components
src/workers/    router Web Worker
pipeline/       build-time data pipeline
data/           hand-edited sources (data/raw/ is gitignored)
tests/e2e/      Playwright
```

## Basemap

`public/basemap/` holds the self-hosted map: `campus.pmtiles` (Protomaps
basemap cut to UTM + margin, z0-15), glyphs and sprites. It is committed, so
builds need no network and the app makes no tile, font or sprite requests to
other hosts. Rebuild it with `pipeline/basemap/fetch-basemap.sh [YYYYMMDD]`.

Full plan: [docs/REWRITE_PLAN.md](docs/REWRITE_PLAN.md).

Map data © OpenStreetMap contributors.

## Test deploy (home server)

`npm run deploy:home` builds and copies `dist/` to `/home/abe/sites/utm-move/html/`.
An `nginx:alpine` container (`utm-move`, `127.0.0.1:8590`) serves it, and the Cloudflare
tunnel "anythinglah" maps `https://utm.abrahamtan.com` to that port.
