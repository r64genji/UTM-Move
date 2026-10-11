# Golden trips (#23)

33 fixed trips in `tests/golden/trips.json` (fixed `{lat, lon}` plus a name, so they survive the places rewrite): 6 hostel to faculty, 5 faculty to faculty, 3 landmarks, 2 stops, 3 through-building, 3 rainy (`sheltered`), 11 bus (Kolej 9/10 to Centre Point at 08:00 on 2026-03-17, plus the v1 regression cases KTGB, KTGB XA2, U5, G17, KTF and T02 to FKT). Every trip is planned with `planQuery` on the built data.

| File | What | Made by |
|---|---|---|
| `tests/golden/baseline.json` | our options per trip: mode, duration, walk m, legs, geometry (5 decimals) | `npx tsx pipeline/golden/baseline.ts` |
| `tests/golden/google.json` | Google walking `duration_s` and `distance_m` only (first route, minutes rounded) | `npx tsx pipeline/golden/google.ts` |
| `tests/golden/real.json` | time from an OSM GPS trace that passes within 100 m of both ends, with `mode` walk or vehicle | `baseline.ts` (reads `GPX_DIR`) |
| `data/raw/reports/golden.html` | table plus a map per trip (needs network for tiles) | `npx tsx pipeline/golden/report.ts` |

`tests/golden-trips.test.ts` needs no network. Per trip it fails when the best duration is more than 10% worse than the baseline, when a bus option disappears that the baseline had, or when a plausibility check fails: walk-only distance at most 1.8x the straight line (a trip may set `maxDetour` with a `detourReason`), walk legs at most 2.2 m/s and bus legs at most 25 m/s, legs and bus stops in time order, bus stops are real stop ids, the route ends within 80 m of the destination. After an intended router change, rerun `baseline.ts` and review the diff. CI now builds the transit and graph data before the tests.

Google: the Maps page worked headless, 33 of 33 parsed, cached in `data/raw/google/` (one request per ~5 s). Real: only 11 trips have a trace, 3 of them walkers (fab-fkm, b04-c05, rain-b12-c05, loose matches) and the rest are buses, so the real column is useful only for the bus rides (K9/K10 to CP: 4.9 and 4.3 min on the bus against our 6.0 and 5.0 door to door, which includes the walk to the stop).

## Findings

Ours vs Google walking, 33 trips: median ratio 0.95. 30 trips are within 25%. Distances agree within 1.3x everywhere except the two below.

### Ours more than 25% slower than Google

1. **psz-msi, Library (PSZ) to Masjid Sultan Ismail: ours 325 m, 3.9 min; Google 71 m, 1 min (3.9x).** Straight line is 82 m. Our route leaves the library south, walks the `Jalan Taqwa` road to (1.55868, 103.63695), and loops around by `Jalan Iman`. Cause in the graph: two edges that should meet do not. Footway edge 1032 ends at (1.55934, 103.63729) and the road edge 1332 ends at (1.55923, 103.63717): a 15 m gap, no node joins them, so the footway from the covered walkway (1.55974, 103.63742) is a dead end. The covered walkway from (1.55993, 103.63695) by the library north side to (1.55974, 103.63742) is also not joined to the library door. Fix: join those ends (a `shortcut` or a footway override), and check the connector from the mosque to the covered walkway at (1.55956, 103.63789).
2. **psz-cans, Library to Canselori: ours 368 m, 4.2 min; Google 220 m, 3 min (1.38x).** Same missing link: the route goes around the same south loop (325 m of it) before the last 40 m.

### Ours more than 25% faster than Google

3. **b12-c02, B12 to C02: ours 236 m, 3.0 min; Google 400 m, 6 min (0.50x).** Plausible, not a bug: we go through the covered walkway under the B blocks (edges 2287 to 2312) and two short stair edges (2398, 2400), which Google's road-style routing cannot use. Check on site that the stairs at (1.5594, 103.63543) and (1.55970, 103.63556) exist, because the shorter route depends on them.

### Borderline (0.75x), not flagged

4. **bus-ktgb-fkt and bus-xa2-fkt: walk-only 51 and 52 min vs Google 68 and 69 min (0.75x).** Google marks part of its route "restricted usage or private roads", so our network probably uses a gate or service road that Google avoids. Check the access tags on the KTGB to Kolej Dato Onn Jaafar roads.
5. **bus-xa2-fkt, Thursday 14:53, bus option (34 min): walk 6 min, route E 12 min, then two walk legs of 4 and 13 min.** A 13 min walk after the bus to FKT, and two walks in a row (a transfer walk, then the egress). The v1 test expected a final ride to FKT. Check why no route D leg is used here.

### Detours above 1.8x the straight line (exempted per trip)

Google walks a similar distance in all of these, so the detour comes from the campus layout (hills, buildings, one road in) and not from our graph: ktdi-n28 (2.81x ours, 2.27x Google), fkt-psz, bus-t02-fkt (2.59x vs 2.43x), rain-b12-c05, b04-c05, ktdi-psz, rain-ktdi-psz, fab-fkm, els-fkt, fkm-fkt, u5-fkt. Two things are still worth checking by someone who knows the campus:
- **fkt-psz (1914 m, Google 1700 m)** goes south along Lingkaran Suria and Jalan Amal almost to 1.5560, then back up to the library, 2.2x the straight line. A footpath through the academic core would be missing in both networks if one exists.
- **bus-t02-fkt** walks 3.8 km: from T02 the graph reaches the academic core only by the south side (Jalan Kempas, around 1.5565, 103.6471 to 103.6428). Same in Google (3.6 km), so likely real.

### Other observations

- **bus-ktf-fkt (08:14)** returns walk only (28 min) on Monday, Tuesday and Wednesday. The v1 test expected a bus there (E then D via Centre Point). Find out whether a bus exists but loses to `MIN_SAVING_S` (2 min) or `ACCESS_CAP_S`, or whether the timetable data lacks it.
- **bus-ktc-fkt** offers three options within 20 s of each other (walk 23 min, bus 20.7, bus 21.0), both buses with a 181 m to 1400 m walk. Fine.
- Our ends are snapped: the route to the library ends on the road end (1.55923, 103.63717) 33 m from the library point. The test allows 80 m. Places will have entrances (#16), which should close this.
