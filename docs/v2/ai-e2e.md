# AI end-to-end test (`npm run test:ai`)

A Playwright run where Gemini drives the app, audits the places list and judges routes. It is not part of CI: it needs the OmniRoute gateway, so you run it locally or on demand.

## Run it

```bash
set -a; source ~/.hermes/.env; set +a   # OMNIROUTE_BASE_URL + OMNIROUTE_API_KEY
npx playwright install chromium         # once, if the browser is missing
npm run test:ai                         # everything
npm run test:ai -- --fresh              # ignore the Gemini cache
npm run test:ai -- -g "B:"              # one part (A:, B:, C:), or any Playwright flag
npm run test:ai -- --project=mobile
```

Without `OMNIROUTE_API_KEY` it prints a skip message and exits 0. The webServer in `tests/ai-e2e/playwright.config.ts` runs `npm run build && npm run preview` on port 4173 (reuses a server already there).

Gemini is `agy/gemini-3.8-flash-medium` through OmniRoute, plain fetch. Replies are cached by hash of the full request (text and images) in `data/raw/cache/ai-e2e/`, so a re-run on unchanged state costs nothing. Esri tiles for the static maps are cached in `data/raw/cache/ai-e2e/tiles/`.

## Setup

Two projects: `mobile` (Pixel 7 descriptor at 390x844, touch) and `desktop` (1440x900). Fake GPS on campus (1.5594, 103.637). The clock is fixed to 2026-03-17 08:00 +08:00 (a Tuesday with bus service); one scenario ("now: plan to N28") runs on the real clock.

## Parts

- **A. Agentic flows** (`agent.spec.ts`, `lib/agent.ts`): six goals on each viewport (search KTDI, plan to N28, Kolej 9/10 to Centre Point at 08:00, bus stop departures, start navigation, one "now" plan). Each loop sends Gemini the goal, an ARIA snapshot and a screenshot, and gets back one JSON action (click, type, press, scroll, wait, done, fail), at most 25 steps. A final judge call returns `success`, `usable` and problems. Fails when the agent fails or gives up, the judge says the goal was not achieved, or any problem has severity high. Placeholder pages fail clearly.
- **B. Location audit** (`places.spec.ts`): reads `public/data/places.json` (missing = fail with "places data is missing"). Deterministic: inside `data/campus-boundary.geojson`, unique ids, non-empty names, no same-name pair within 25 m. Gemini reviews all places in spatial batches of at most 50, each with an Esri imagery map of the batch. Fails on any deterministic failure or any Gemini flag with severity high. Output: `places-audit.json` and `places-audit.md`.
- **C. Route plausibility** (`routes.spec.ts`): 12 golden trips plus 8 seeded random pairs (places if `places.json` exists, bus stops otherwise), per viewport. Each opens `/plan?from=..&to=..&when=depart&at=..` and saves a screenshot and the page text. The router (`planQuery`) is also called directly. Deterministic checks (`lib/checks.ts`): walk speed 3 to 6.5 km/h, walk-only detour at most 2x the straight line, bus stop times in order, legs in time order, route starts and ends within 100 m of the endpoints, a walk-only option always present. Gemini then sees the router's route drawn on Esri imagery (so it is judged even before the UI draws it) plus the app screenshot and the numbers. Fails on a deterministic failure or `implausible` with severity high.

## Output

`data/raw/ai-e2e/<run>/`: `report.html` (pass or fail per part and viewport, with screenshots), `results/*.json`, `agent/<viewport>/<goal>/step-NN.png` and `steps.txt`, `routes/`, `places/`, `places-audit.{json,md}`, `pw/` (Playwright traces).

The deterministic checkers have unit tests in `tests/ai-e2e/lib/checks.test.ts` (run by `npm test`).
