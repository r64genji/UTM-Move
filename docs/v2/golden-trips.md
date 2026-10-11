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

Ours vs Google walking, 33 trips: median ratio 0.92 (was 0.95 before gap closing). 29 trips are within 25%. Distances agree within 1.3x everywhere except the one below. Baseline regenerated after the route fixes (#gap-closing, #no double walk legs). Changes against the old baseline (best option duration): ktdi-n28 12.2 to 9.8 min, b04-c05 5.8 to 4.4, rain-b12-c05 7.1 to 4.9, bus-g17-fkt 21.0 to 13.8, psz-msi 3.9 to 3.1, psz-cans 4.2 to 3.6, smaller moves within +6% (fab-fkm 8.8 to 9.3, p05-n28, rain-ktho-n28, ja1-ja4) and one worse: bus-xa2-fkt 34.3 to 51.9 min (see 3). The faster ones come from 89 joined mapping gaps (graph-pipeline.md); b04-c05 and fab-fkm both use the longest one (17.9 m, road end to covered walkway at 1.56060, 103.63578), so check on site that the link is real.

### Ours more than 25% slower than Google

1. **psz-msi, Library (PSZ) to Masjid Sultan Ismail: ours 307 m, 3.1 min (was 325 m); Google 71 m, 1 min.** Two causes. The mapping gap is fixed: footway edge 1032 ended at (1.55934, 103.63729) and road edge 1332 at (1.55923, 103.63717), 17.6 m apart with no node joining them. That is a general OSM gap, now closed by the build (all 89 of them, not this one spot). It saves little here because of the second cause: the mosque point is 40 m from the nearest way on the east and 43 m on the west, and the coordinate snaps to the east side, which is reachable only by a loop around the mosque. Walking to the west way would be about 94 m (33 m + 18 m + the 43 m last bit). Real places have entrances (#16), which removes the snap problem; a bare coordinate in the golden list does not. The trip keeps a `maxDetour` of 3.8.
2. **psz-cans, Library to Canselori: ours 329 m, 3.6 min (was 368 m); Google 220 m, 3 min.** Within the 25% time band now (1.2x time). The rest of the detour is the same unmapped entrance problem.

### Ours more than 25% faster than Google

3. **b12-c02, B12 to C02: ours 236 m, 3.0 min; Google 400 m, 6 min (0.50x).** Plausible, not a bug: we go through the covered walkway under the B blocks (edges 2287 to 2312) and two short stair edges (2398, 2400), which Google's road-style routing cannot use. Check on site that the stairs at (1.5594, 103.63543) and (1.55970, 103.63556) exist, because the shorter route depends on them. rain-b12-c05 (0.70x) and b04-c05 (0.73x) are the same walkway plus gap links.

### Borderline (0.75x), not flagged

4. **bus-ktgb-fkt and bus-xa2-fkt: walk-only 51 and 52 min vs Google 68 and 69 min (0.75x).** Google marks part of its route "restricted usage or private roads", so our network probably uses a gate or service road that Google avoids. Check the access tags on the KTGB to Kolej Dato Onn Jaafar roads.

### Bus cases that were questioned

5. **bus-xa2-fkt, Thursday 14:53: the bus option is gone, on purpose.** The old option (34 min) was E to Jalan Amal 4, a 3.7 min transfer walk to P19, then a 13 min walk to FKT: two walk legs in a row, 16.7 min of walking after the bus. RAPTOR had treated the P19 stop as the target and the 13 min egress was counted from P19, so the transfer walk slipped past `ACCESS_CAP_S` (15 min). The direct walk from Jalan Amal 4 to FKT is 1.23 km, 17.0 min, also over the cap. Fix in `planTrip`: a journey that starts or ends with a walk leg is dropped (the journey to the stop you would walk from or to already exists), so the cap holds everywhere. Result: walk only, 52 min. There is no alternative bus: D from Centre Point to FKT runs at 16:15 that afternoon (E arrives at Centre Point 15:10), arrival 16:21 against 15:45 walking. If a bus with a 17 min last walk (saving 17 of 52 min) is wanted, raise the cap on purpose; the test `no two walk legs in a row` stays valid. bus-g17-fkt and bus-ktc-fkt had the same double walk and are now 13.8 and 21.0 min with one walk each (bus-ktc-fkt lost its third, near-duplicate option).
6. **bus-ktf-fkt (08:14): walk only (28 min) Monday to Wednesday is correct, not a bug.** Walk arrives 08:42. The bus is KTF to Centre Point on E2 (08:15, arrives 08:25) then D1 at 08:45 (route D runs :15 and :45 at Centre Point; the 08:15 is missed by 10 minutes), arriving at FKT 08:51, so 9 min later than walking even before the last walk. Same from H01, K6, KRP and AM. The `MIN_SAVING_S` and `ACCESS_CAP_S` rules never come into it: RAPTOR finds no faster bus. v1 expected a bus there because it did not compare against the walk. 

### Detours above 1.8x the straight line (exempted per trip)

Google walks a similar distance in all of these, so the detour comes from the campus layout (hills, buildings, one road in) and not from our graph: ktdi-n28 (now 695 m, 1.97x), fkt-psz, bus-t02-fkt (2.59x vs 2.43x), rain-b12-c05, b04-c05, ktdi-psz, rain-ktdi-psz, fab-fkm, els-fkt, fkm-fkt, u5-fkt. Two things are still worth checking by someone who knows the campus:
- **fkt-psz (now 1833 m, Google 1700 m)** goes south along Lingkaran Suria and Jalan Amal almost to 1.5560, then back up to the library. A footpath through the academic core would be missing in both networks if one exists.
- **bus-t02-fkt** walks 3.8 km: from T02 the graph reaches the academic core only by the south side (Jalan Kempas, around 1.5565, 103.6471 to 103.6428). Same in Google (3.6 km), so likely real.

### Other observations

- **bus-ktc-fkt** now offers one bus option (21.0 min against 23.1 walking), a 181 m walk to the stop.
- Our ends are snapped: the route to the library ends on the road end (1.55923, 103.63717) 33 m from the library point. The test allows 80 m. Places will have entrances (#16), which should close this.
