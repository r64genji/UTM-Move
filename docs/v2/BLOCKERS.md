# v2 blockers

## #3 Vercel preview for branch `v2` fails

- The Vercel project `r64genjis-projects/utm-move` is linked to GitHub. It built
  a Preview for the `v2` push (commit 61b19da), but the deployment failed:
  https://vercel.com/r64genjis-projects/utm-move/DbuwoMgBFC4VgEURo9JRDoQbpzDq
- GitHub Actions CI on the same commit is green.
- The Vercel CLI on this machine is not logged in (`vercel whoami` hangs waiting
  for login), so the build log could not be read.
- Likely cause: the project's Root Directory is `Frontend` (v1 kept its
  `vercel.json` there). v2 has no `Frontend/`; the app is at the repo root.

To fix (needs a human with Vercel access, without touching production):

1. Run `npx vercel inspect dpl_DbuwoMgBFC4VgEURo9JRDoQbpzDq --logs` to confirm
   the cause.
2. If it is the Root Directory: the setting is per project, and production (v1,
   `main`) still needs `Frontend`. Either create a second Vercel project for v2
   (root `.`, framework Vite, output `dist`) linked to the same repo, or change
   the root at cutover (#33).

## #5/#6 Bus timetable for session 2026/2027

Carried over by user decision 2026-10-12: the 2025/2026 times are used for session 2026/2027 and the
app shows "Timetable from 2025/2026. Times may change." (`timetableNote` in `transit.json`). Dates come
from the 2026/2027 academic calendar. Replace the times when the 2026/2027 PDF is published (steps below).

- `data/transit/` holds the 2025/2026 timetable (effective 6 Oct 2025). Its calendar now runs to
  3 Oct 2027 (2026/2027 academic calendar dates, holidays and breaks).
- Session 2026/2027 starts 12 Oct 2026 (UTM Pekeliling Akademik Bil. 6/2026). UTM Fleet (Jabatan
  TNC(P)) usually issues a new "Jadual Shuttle Kampus" PDF for each session.

To fix (needs a human to get the new PDF): put it in `data/raw/`, update the `buses:` times in
`data/transit/route-*.yaml` and the dates in `data/transit/calendar.yaml` (from the 2026/2027
academic calendar at https://amd.utm.my/academic-calendar/), then run `npm run build:transit`
and `npm test`.

## #30 Shortcut report form

Removed by user decision 2026-10-12: no Google Form.

## #34 Weekly data rebuild: first scheduled run

`.github/workflows/weekly-data.yml` and `npm run data:weekly` are done and the script was run locally (report in `data/raw/reports/weekly.md`).
"The first scheduled run opens a PR" can only be checked after `v2` is pushed (the user controls pushes), and scheduled workflows only run from the default branch, so it also needs the workflow on `main` at cutover (#33), or a manual `workflow_dispatch` run once the workflow is on a pushed branch.
Also needed: repo setting Actions > Workflow permissions > "Allow GitHub Actions to create and approve pull requests".
No `build:places` script exists on `v2` yet; the workflow runs it with `--if-present`, so places are rebuilt once the places branch is merged.
PRs opened with the default `GITHUB_TOKEN` do not trigger CI; run the checks locally or use a PAT.

## #35 OSM checklist

Adding to OpenStreetMap is a manual human step (iD editor, Esri or Bing imagery, one small changeset per area, no bulk upload). Nothing here edits OSM.
Today 0 candidates are `verified` (5 likely, 104 guess) and there are no door overrides, so `docs/v2/osm-checklist.md` is empty. It fills in as evidence arrives (`npm run export:osm`).
The drop rule is live: `score:shortcuts` marks a candidate `inOsm` when at least 70% of it is within 8 m of a way in `data/osm/walk-ways.geojson`, and `build:graph` skips it. It only takes effect after `data/osm/walk-ways.geojson` is re-extracted from a newer OSM export; that step needs the `.pbf` and is not in the weekly workflow. "First changeset is live, next build drops those items" is unverifiable until a human makes a changeset.
