# graph.bin format (version 1)

The walk graph the browser routes on. Written by the pipeline (#18), read by
`src/domain/walk` (#20). Code: `src/domain/walk/graph.ts`.

The pipeline does not write bytes by hand. It builds a plain `GraphInput`
object and calls `encodeGraph(input)`, then writes the `ArrayBuffer` to
`public/data/graph.bin`. The app calls `decodeGraph(buf)` (or `loadGraph(url)`).

## Input object (what the pipeline builds)

```ts
encodeGraph({
  nodes: [{ lat, lon, name? }],          // name: landmark for turn steps, e.g. 'FKE P05'
  edges: [{
    from, to,                            // node indexes
    lengthM,
    climbUpM?, climbDownM?,              // metres up / down walking from -> to
    kind,                                // see Kinds
    sheltered?, stepFree?, likely?, indoor?,
    hours?,                              // OpeningHours from schemas.ts, Asia/Kuala_Lumpur
    name?,                               // building / walkway name
    geometry?: [{ lat, lon }],           // points between from and to, endpoints not repeated
  }],
})
```

Rules for the pipeline:

- Edges are undirected (walking works both ways). Climb is given for from -> to;
  the reader swaps up and down for the other direction.
- Do not emit `guess` shortcuts or `access: private` edges. `likely` shortcuts
  get `likely: true`. Verified shortcuts are plain edges.
- Set `hours` on every edge that is only usable while a building is open
  (indoor edges and their doors). The router skips any edge with `hours`
  when it is closed at trip time, not only `indoor` ones.
- `stepFree` matters on `door` edges: the no-stairs profile drops `steps`
  edges and `door` edges without `stepFree`.
- `sheltered` (or `indoor`) is what the sheltered profile treats as covered.
- Give junction nodes a `name` when a landmark is next to them (nearest
  building block within about 40 m). Steps read 'Turn left after <name>'.
- Round `lengthM` and climb to 0.1 m before encoding. Random float noise
  gzips badly.

## Binary layout

Little-endian. A 32-byte header, then sections in the order below. Each
section starts on a 4-byte boundary (zero padding after it). Then a UTF-8
JSON blob.

### Header

| Offset | Type | Field |
|---|---|---|
| 0 | u32 | magic `0x574D5455` (bytes `UTMW`) |
| 4 | u16 | version (1) |
| 6 | u16 | reserved, 0 |
| 8 | u32 | node count `N` |
| 12 | u32 | edge count `E` |
| 16 | u32 | geometry point count `G` |
| 20 | u32 | JSON blob byte length |
| 24 | 8 bytes | reserved, 0 |

### Sections

| # | Name | Type | Length | Meaning |
|---|---|---|---|---|
| 1 | nodeLat | i32 | N | latitude x 1e7 |
| 2 | nodeLon | i32 | N | longitude x 1e7 |
| 3 | adjStart | u32 | N + 1 | CSR offsets: node n owns `adj[adjStart[n] .. adjStart[n+1])` |
| 4 | adj | u32 | 2E | `edge * 2 + dir`; dir 0 walks from -> to, dir 1 walks to -> from |
| 5 | edgeFrom | u32 | E | node index |
| 6 | edgeTo | u32 | E | node index |
| 7 | edgeLength | f32 | E | metres |
| 8 | edgeClimbUp | f32 | E | metres up, from -> to |
| 9 | edgeClimbDown | f32 | E | metres down, from -> to |
| 10 | geomStart | u32 | E + 1 | edge e's inner points are `geom[geomStart[e] .. geomStart[e+1])` |
| 11 | geomLat | i32 | G | latitude x 1e7 |
| 12 | geomLon | i32 | G | longitude x 1e7 |
| 13 | nodeName | u16 | N | index into `strings`, `0xFFFF` = none |
| 14 | edgeHours | u16 | E | index into `hours`, `0xFFFF` = always open |
| 15 | edgeName | u16 | E | index into `strings`, `0xFFFF` = none |
| 16 | edgeKind | u8 | E | see Kinds |
| 17 | edgeFlags | u8 | E | see Flags |

Then the JSON blob: `{ "strings": string[], "hours": OpeningHours[] }`.
Strings and hours are de-duplicated by the encoder.

Fixed-point 1e7 degrees is about 1 cm. An edge's full line is
`node(from), geom..., node(to)`.

### Kinds (u8)

Order is part of the format. Only append.

| Value | Kind |
|---|---|
| 0 | road |
| 1 | footway |
| 2 | path |
| 3 | steps |
| 4 | covered |
| 5 | indoor |
| 6 | shortcut |
| 7 | door |
| 8 | crossing |
| 9 | ramp |
| 10 | connector (build-time link closing a gap of a few metres between two mapped ways) |

### Flags (u8 bitfield)

| Bit | Value | Flag |
|---|---|---|
| 0 | 1 | sheltered |
| 1 | 2 | stepFree |
| 2 | 4 | likely (unverified shortcut tier) |
| 3 | 8 | indoor |

## Versioning

Bump `GRAPH_VERSION` for any layout change. `decodeGraph` throws on a version
it does not know, so a stale cached file fails loudly instead of routing wrong.
Appending a kind or a flag bit does not need a bump.

## How the router uses it

- Time per edge: Tobler's hiking function on the climb, scaled so flat ground
  is 1.4 m/s. Climb and descent are assumed to be at one steady grade.
- Profiles: `fastest` (time, likely edges x1.2), `sheltered` (open air x3),
  `no-stairs` (fastest without `steps` and non-step-free `door` edges).
- Edges with `hours` are skipped when closed at the trip time (Asia/Kuala_Lumpur, UTC+8).
- Measured (`npm run bench:walk`, synthetic 10k nodes / 20k edges): route
  corner to corner 4-8 ms, one-to-many to 60 stops 6 ms, decode 0.02 ms.
