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

- `data/transit/` holds the 2025/2026 timetable (effective 6 Oct 2025). That session ended
  4 Oct 2026, so the calendar has no service days after that date.
- Session 2026/2027 starts 12 Oct 2026 (UTM Pekeliling Akademik Bil. 6/2026). UTM Fleet (Jabatan
  TNC(P)) usually issues a new "Jadual Shuttle Kampus" PDF for each session.

To fix (needs a human to get the new PDF): put it in `data/raw/`, update the `buses:` times in
`data/transit/route-*.yaml` and the dates in `data/transit/calendar.yaml` (from the 2026/2027
academic calendar at https://amd.utm.my/academic-calendar/), then run `npm run build:transit`
and `npm test`.
