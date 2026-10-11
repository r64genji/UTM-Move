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

Full plan: [docs/REWRITE_PLAN.md](docs/REWRITE_PLAN.md).

Map data © OpenStreetMap contributors.
