# Backend Documentation

## Overview

The UTM Move backend is a Node.js/Express server that provides:
- Static data API for routes and schedules
- Real-time bus arrival calculations
- Intelligent direction finding with walking + bus combinations
- GraphHopper integration for walking directions

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime environment |
| Express | 5.2.1 | REST API framework |
| Helmet | 8.1.0 | Security headers |
| CORS | 2.8.5 | Cross-origin requests |
| Express Rate Limit | 8.2.1 | API rate limiting |
| Axios | 1.13.2 | HTTP client for GraphHopper |
| dotenv | 17.2.3 | Environment variables |
| pdf-parse | 1.1.1 | PDF schedule parsing |
| Jest | 30.2.0 | Testing framework |
| Supertest | 7.2.2 | API testing |

## Architecture

```
Backend/
├── server.js               # Express server & API routes (~21KB)
├── directionLogic.js       # Re-exports from directions/
├── enrich_schedule_logic.js # Schedule enhancement
│
├── directions/             # Modular routing engine (8 modules)
│   ├── index.js            # Main getDirections() orchestrator (~25KB)
│   ├── dataLoader.js       # Cached data loading + indexes (~5KB)
│   ├── locationService.js  # Stop/location lookups (~6KB)
│   ├── routeFinder.js      # Route discovery algorithms (~10KB)
│   ├── routingEngine.js    # A* pathfinding + route scoring (~23KB)
│   ├── scheduler.js        # Departure time calculations (~6KB)
│   ├── responseBuilder.js  # Response formatting (~18KB)
│   └── walkingService.js   # GraphHopper walking directions (~7KB)
│
├── data/                   # JSON data files (~560KB total)
│   ├── schedule.json           # Bus schedules (54KB)
│   ├── campus_locations.json   # Campus locations (243KB)
│   ├── route_geometries.json   # GeoJSON route paths (237KB)
│   ├── route_durations.json    # Travel times (23KB)
│   └── geometry_manifest.json  # Geometry metadata
│
├── tests/                  # Jest test files (13 suites, 65 tests)
├── scripts/                # Development utilities (32 scripts)
└── utils/
    ├── geo.js              # Haversine distance calculations
    └── validators.js       # Input validation
```

## Core Modules

### server.js

Express server with main endpoints:
- `GET /api/health` - Health check
- `GET /api/static-data` - All schedule and location data
- `GET /api/next-bus` - Next bus for a route
- `GET /api/directions` - Complete directions
- `POST /api/reports` - Submit issue reports

Security features:
- Helmet for security headers
- CORS configuration
- Rate limiting (100 requests/15min)
- Input validation

### directions/index.js

Main orchestrator that:
1. Resolves origin and destination
2. Finds nearest stops
3. Evaluates direct, loop, and transfer routes
4. Returns optimal route with walking steps

```javascript
const { getDirections } = require('./directions');

const result = await getDirections(
    originLat,    // GPS latitude
    originLon,    // GPS longitude
    originStopId, // or specify stop directly
    destLocationId,
    currentTime,  // "HH:MM"
    dayOverride,  // optional
    forceBus      // skip walk optimization
);
```

### directions/dataLoader.js

Pre-computed indexes for O(1) lookups:
- `stopsById` - Map<stopId, stop>
- `locationsById` - Map<locationId, location>
- `routesByStop` - Map<stopId, routes[]>
- `tripsByRoute` - Map<routeName, trips[]>

### directions/locationService.js

Location services with LRU caching:
- `getStopById(id)` - O(1) stop lookup
- `getLocationById(id)` - O(1) location lookup
- `findNearestStops(lat, lon)` - Cached nearest stops

### directions/routeFinder.js

Route discovery algorithms:
- `findDirectRoutes(origin, dest)` - Same-line routes
- `findLoopRoutes(origin, dest)` - Multi-trip loops (e.g., Route E)
- `findTransferRoutes(origin, dest)` - Via transfer points

### directions/scheduler.js

Time calculations with Friday prayer support:
- `getNextDeparture(route, stopIndex, time, day)`
- `getDynamicOffset(route, headsign, stopIndex)`
- `isDuringFridayPrayer(time, day)` - 12:40-14:00

### directions/walkingService.js

GraphHopper integration for turn-by-turn walking:
```javascript
const { getWalkingDirections } = require('./walkingService');

const result = await getWalkingDirections(
    { lat: 1.55, lon: 103.63 },
    { lat: 1.56, lon: 103.64 }
);
// Returns: { distance, duration, ascent, descent, steps: [...], geometry }
```

### directions/routingEngine.js

Unified routing engine combining A* pathfinding with strategic scoring:

```javascript
const { findOptimalPath, isWalkingBetter } = require('./routingEngine');

// Find optimal bus route using A*
const path = await findOptimalPath(
    originLat, originLon,
    destLocation,
    startTime,
    dayName
);

// Returns: { type, stops, route, departure, arrival, totalTime }
```

Key features:
- **A* Search** - Priority queue-based optimal path finding
- **Multi-modal** - Supports walking + bus combinations
- **Transfer Detection** - Finds routes requiring transfers
- **Walking Optimization** - Suggests walking when faster than bus

## Response Types

### WALK_ONLY
```json
{
    "type": "WALK_ONLY",
    "message": "Walk 450m to your destination.",
    "totalWalkingDistance": 450,
    "totalDuration": 6,
    "summary": {
        "distance": 450,
        "duration": 6,
        "ascent": 5,
        "descent": 3
    },
    "walkingSteps": [
        { "instruction": "Head north", "distance": 50 },
        { "instruction": "Turn right", "distance": 200 }
    ]
}
```

### DIRECT
```json
{
    "type": "DIRECT",
    "summary": {
        "route": "Route A",
        "headsign": "To Arked",
        "departure": "08:15",
        "totalDuration": 12
    },
    "steps": [
        { "type": "walk", "instruction": "Walk to CP" },
        { "type": "board", "instruction": "Board Route A" },
        { "type": "alight", "instruction": "Alight at K9" },
        { "type": "walk", "instruction": "Walk to destination" }
    ]
}
```

### TRANSFER
```json
{
    "type": "TRANSFER",
    "summary": {
        "route": "Route A → Route E",
        "transferAt": "Centre Point"
    },
    "steps": [...]
}
```

## Environment Variables

Create `.env` file:

```env
PORT=3000
GRAPHHOPPER_URL=http://localhost:8989
NODE_ENV=development
```

## Testing

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm test -- --coverage # With coverage
```

Test files (13 suites, 65 tests):
- `astar.test.js` - A* pathfinding
- `constants.test.js` - Constants validation
- `directionLogic.test.js` - Direction finding
- `directionsIntegration.test.js` - Integration tests
- `enrich_schedule_logic.test.js` - Schedule enrichment
- `geo.test.js` - Distance calculations
- `routeFinder.test.js` - Route discovery
- `routeScorer.test.js` - Route scoring
- `routing_edge_cases.test.js` - Edge cases
- `security.test.js` - Security middleware
- `validators.test.js` - Input validation

## Performance Optimizations

1. **Pre-computed indexes** - O(1) lookups for stops, locations, routes
2. **LRU cache** - Nearest stops cached (100 entries max)
3. **Parsed times cache** - Route times pre-parsed to minutes
4. **Set-based lookups** - O(1) stop membership checks
5. **Static data caching** - Schedule data loaded once at startup

## Running the Server

```bash
npm start      # Production mode
npm run dev    # Development mode with nodemon
```

The server runs on `http://localhost:3000` by default.
