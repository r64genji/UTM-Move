# Transit data (tickets #5, #6)

## Files

| File | What |
|---|---|
| `data/transit/stops.yaml` | 51 stops (`{ lat, lon }`) |
| `data/transit/route-{a..j}.yaml` | one file per PDF route: patterns (stop list, drive times, line) and buses (PDF departures) |
| `data/transit/calendar.yaml` | session dates, services, Friday prayer gap, public holidays, semester breaks |
| `pipeline/transit/build.ts` | `npm run build:transit` → `public/data/transit.json` (273 KB, 29 KB gzip) |
| `pipeline/transit/compare-v1.ts` | `npx tsx pipeline/transit/compare-v1.ts`: departure count and differences against v1 |
| `src/domain/transit/departures.ts` | `nextDepartures(data, stopId, at)`, `departuresOn`, `runsOn`, `klDateTime` |
| `src/domain/transit/polyline.ts` | `decodePolyline(shape)` → `{ lat, lon }[]` for route lines |

Route files are grouped **by bus**, the way the PDF is printed (one page per bus: A1, B1–B3,
C1–C3, D1, E1–E6, F1–F2, G1–G2, H, J, plus the E1/E2 weekend pages). Each bus lists its departure
times from the first stop of each pattern. To check a page, open the matching `page:` in the PDF.

## Sources

- Timetable: `data/raw/Jadual-Shuttle-Kampus-Sesi-2025-2026.pdf` (UTM Fleet, Jabatan TNC(P), scanned
  18 Sep 2025, effective 6 Oct 2025, 22 pages). Every departure on every page was typed into the YAML
  and compared with v1.
- Stops, stop order, measured drive times, and route lines: tag `v1`, `Backend/data/schedule.json`,
  `route_durations.json`, `route_geometries.json`. `route_waypoints.json` is not needed. It only shaped
  the v1 lines for D and G, and those lines are already kept.
- Calendar: UTM Academic Calendar 2025/2026 (Bachelor, Master and Doctoral),
  https://amd.utm.my/wp-content/uploads/sites/460/2025/12/POSTGRADUATE-2025-2026-02122026.pdf.
  Its public-holiday column lists the holidays for the JB campus (Johor). "KL only" days are left out.

## Departure count: 559 (v1 had 554)

`npx tsx pipeline/transit/compare-v1.ts` prints:

```
v1 departures: 554
v2 departures: 559
  + 1 only in v2 (PDF): 18:00  [mon,tue,wed,thu,fri | T02 T06 T08 K9 K10 KP1]
  + 4 only in v2 (PDF): 07:00 08:00 11:00 17:30  [mon,tue,wed,thu,fri | KDOJ_XB2 KDOJ ... T02]
```

1. **+1 Route B, 18:00 from Cluster (T02).** The PDF (page 2, bus B1) has it. v1 left it out.
2. **+4 Route E via N24, from KDOJ at 07:00, 08:00, 11:00, 17:30.** Two buses (E1 and E5) leave at
   each of these times. v1 merged the pair into one departure here, but kept both copies in the
   opposite direction ("To KDOJ"). v2 keeps one trip per bus in both directions.

Every other v1 departure matches the PDF exactly.

## Other differences from v1

- **Friday prayer gap.** Every weekday page says "No service from 12:40 to 14:00 every FRIDAY" and
  shades the affected rows. The rule that fits every page: a trip does not run on Friday if its
  first-stop time is in [12:40, 14:00). For example, A1 skips 12:40 and 13:20 but runs at 14:00, and B2
  skips 12:45 from T02 but runs at 14:05. This drops 61 trips on Fridays (calendar
  `weekday-except-friday-prayer` = Mon–Thu). v1 ran them on Fridays.
- **Holidays and semester breaks.** v1 ran every weekday all year. v2 removes the public holidays and
  the final semester breaks listed in `calendar.yaml`.
- **Route E is one route.** v1 split it into `E(JA)`, `E(N24)` and `E(CP)`. The PDF has one route E with
  six buses: E1/E3/E5 run via N24, and E2/E4/E6 run via Jalan Amal (D05). v2 has one route `E` with 7
  patterns. v1's "To KDOJ" was identical for `E(JA)` and `E(N24)` (same stops, same line), so v2 keeps
  it as one pattern, `E:to-kdoj`.
- **Route C "To CP"** listed `KTC_B2W` twice in a row. The duplicate is dropped.
- **Routes keep the PDF letters** (A–H, J). Colours come from the v1 frontend README.
- **Route F/G "KTR (K01)".** The PDF names the terminus KTR (K01). v1 uses stop `K19`. It was kept
  because there is no K01 stop. Worth checking on the map later.

## Stop times (#6)

Time at stop *i* = first-stop departure + the sum of drive times up to stop *i* + 15 s for each stop
already passed, rounded to the minute.

- Drive times come from v1 `route_durations.json` (`drivingSecs`, measured), looked up by stop pair.
- Six hops had no measurement. They are estimated from the length of the v1 line at 28.9 km/h (the
  mean of all measured hops) and marked `# estimated` in the YAML: H `P19A>V01` (2.35 km), H `V01>CP`
  (2.44 km), J `KTC_B1E>STADIUM`, `STADIUM>KTC_B1W`, `KTC_B1W>KTC_B2W`, `KTC_B2W>P19A`.
- 15 s stop wait: the PDF limits it. G1 leaves KTR at 7:00 and FKT at 7:15, which allows 900 s for
  638 s of driving and 12 middle stops, so the average wait is at most 22 s. A test checks that every
  bus reaches the end of each trip before its next PDF departure.
- v1's `totalSecs` was not used. It spreads the bus's whole cycle time over the hops, so A would take
  30 min from KP to CP when the bus already leaves CP 15 min after leaving KP.

These are timetable estimates. There are no live bus positions.

## Calendar assumptions

- Session: 2025-10-06 (PDF effective date) to 2026-10-04 (end of Semester II / short semester).
- No service on the public holidays and **final** breaks (Sem I: 9 Feb – 15 Mar 2026; Sem II:
  20 Jul – 4 Oct 2026). This applies to every service, the weekend one included. The weekend pages
  do not say.
- **Mid-semester breaks are assumed to have service** (24–30 Nov 2025, 4–10 May 2026). The PDF says
  "semester breaks" without saying which ones. If that is wrong, change `kind: mid` to `kind: final`.
- UTM moved 16–29 Mar 2026 teaching online (Pekeliling Akademik Bil. 1/2026). This is not treated as
  a break.
- Johor's weekend is Saturday and Sunday (since 2025). This matches the PDF.

## Stop fixes (#5)

### V01

`V01` (1.543925, 103.632305) is about 540 m outside `data/campus-boundary.geojson`. The PDF calls it
**"V01 (TMN U)"**: route H runs CP – Jalan Amal – V01 – CP and goes out to Taman Universiti. In OSM
the point is on Jalan Kebudayaan 1 in Taman Universiti, 78 m from UTMSPACE. It is a real off-campus
terminus, so it was not moved. It is renamed "V01 (Taman Universiti)" and marked `offCampus: true`
(a new optional field on `Stop`). The validation gate (#19) should let `offCampus` stops be outside
the polygon.

### Unused stops removed

No trip in v1 or the PDF stops at these. Each one sits next to a stop that is used (the other side of
the road). If a later timetable needs one again, add it back from here:

| id | lat | lon | nearest kept stop |
|---|---|---|---|
| KLUSTER_BS | 1.562602 | 103.655134 | KLUSTER_BN, 38 m |
| K18 | 1.561286 | 103.632563 | K17, 15 m |
| K24 | 1.563472 | 103.629439 | K23, 47 m |
| K27 | 1.564462 | 103.631823 | K28, 13 m |
| K32 | 1.564827 | 103.634037 | K31, 18 m |
| K33 | 1.564444 | 103.633800 | K31, 66 m |

## Line geometry

Each pattern keeps its v1 line as a Google encoded polyline (precision 5, about 1 m) in the YAML
`shape:` field and in `transit.json` `patterns[].shape`. That is 7 KB for all 23 patterns. Decode it with
`decodePolyline`. Two v1 lines do not start at their first stop: `C:to-cp` starts 230 m from K9, and
`E:k910-to-kdoj` starts 226 m from K9. The map (#29) should still draw them, but they need fixing
before legs are cut from them (#21).

## Known gaps

- **The timetable has expired.** The 2025/2026 session ended on 4 Oct 2026. The 2026/2027 session
  starts 12 Oct 2026 (UTM Pekeliling Akademik Bil. 6/2026). The calendar has no service days after
  2026-10-04, so the app will show no buses until a new PDF is typed in. See `docs/v2/BLOCKERS.md`.
- `nextDepartures` returns the rest of the current Kuala Lumpur day only. It does not look ahead to
  the next service day.
