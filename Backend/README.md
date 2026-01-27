# Backend Documentation

## Overview

The UTM Move backend is a Node.js/Express server that provides:
- Static data API for routes and schedules
- Real-time bus arrival calculations
- Intelligent direction finding with walking + bus combinations
- Graphhopper integration for walking directions

## Architecture

```
Backend/
├── server.js               # Express server & API routes
├── directionLogic.js       # Re-exports from directions/
├── enrich_schedule_logic.js # Schedule enhancement
│
├── directions/             # Modular routing engine
│   ├── index.js            # Main getDirections() orchestrator
│   ├── dataLoader.js       # Cached data loading + indexes
│   ├── locationService.js  # Stop/location lookups
│   ├── routeFinder.js      # Route discovery algorithms
│   ├── routingEngine.js    # A* pathfinding + route scoring
│   ├── scheduler.js        # Departure time calculations
│   ├── responseBuilder.js  # Response formatting
│   └── walkingService.js   # GraphHopper walking directions
│
├── data/                   # JSON data files
├── tests/                  # Jest test files (13 suites)
├── scripts/                # Development utilities (32 scripts)
└── utils/
    ├── geo.js              # Haversine distance
    └── validators.js       # Input validation
```

## Core Modules

### server.js

Express server with four main endpoints:
- `GET /api/health` - Health check
- `GET /api/static-data` - All schedule and location data
- `GET /api/next-bus` - Next bus for a route
- `GET /api/directions` - Complete directions

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

## Testing

```bash
npm test           # Run all tests
npm test -- --watch  # Watch mode
```

Test files:
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

## Performance Optimizations

1. **Pre-computed indexes** - O(1) lookups for stops, locations, routes
2. **LRU cache** - Nearest stops cached (100 entries max)
3. **Parsed times cache** - Route times pre-parsed to minutes
4. **Set-based lookups** - O(1) stop membership checks
