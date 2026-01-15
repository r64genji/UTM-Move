# API Reference

## Base URL

```
http://localhost:3000/api
```

---

## Endpoints

### GET /static-data

Returns all static data needed by the frontend.

**Response:**
```json
{
  "stops": [
    { "id": "CP", "name": "Centre Point", "lat": 1.5584, "lon": 103.6378 }
  ],
  "routes": [
    {
      "name": "Route A",
      "services": [...]
    }
  ],
  "route_geometries": {
    "Route A : To Arked": { "type": "LineString", "coordinates": [...] }
  },
  "route_waypoints": {},
  "locations": [
    { "id": "PSZ", "name": "Perpustakaan Sultanah Zanariah", ... }
  ]
}
```

---

### GET /next-bus

Get the next bus arrival for a specific route.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `route` | string | Yes | Route name (e.g., "Route A") |
| `time` | string | Yes | Current time in "HH:MM" format |
| `stop` | string | No | Filter by stop name |

**Example:**
```
GET /api/next-bus?route=Route%20A&time=08:15
```

**Response:**
```json
{
  "query_route": "Route A",
  "found_route": "Route A",
  "next_bus_time": "08:30",
  "at_stop": "Centre Point"
}
```

---

### GET /directions

Get directions from origin to destination.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `originLat` | number | Yes* | Origin latitude |
| `originLon` | number | Yes* | Origin longitude |
| `originStopId` | string | Yes* | Or specify origin by stop ID |
| `destLocationId` | string | Yes | Destination location ID |
| `time` | string | No | Time "HH:MM" (default: now) |
| `day` | string | No | Day override (monday, friday, etc.) |
| `forceBus` | boolean | No | Skip walking optimization |

*Either `originLat`+`originLon` OR `originStopId` required

**Example:**
```
GET /api/directions?originLat=1.5584&originLon=103.6378&destLocationId=PSZ&time=08:00
```

---

## Response Types

### WALK_ONLY

Returned when walking is the optimal option.

```json
{
  "type": "WALK_ONLY",
  "message": "Walk 450m to your destination.",
  "destination": {
    "id": "PSZ",
    "name": "Perpustakaan Sultanah Zanariah",
    "lat": 1.5591,
    "lon": 103.6345
  },
  "totalWalkingDistance": 450,
  "totalDuration": 6,
  "hasDetailedDirections": true,
  "walkingSteps": [
    {
      "stepNumber": 1,
      "instruction": "Head north on Jalan Universiti",
      "distance": 120,
      "duration": 2,
      "type": "depart"
    },
    {
      "stepNumber": 2,
      "instruction": "Turn right",
      "distance": 200,
      "duration": 3,
      "type": "turn_right"
    },
    {
      "stepNumber": 3,
      "instruction": "Arrive at destination",
      "distance": 130,
      "duration": 1,
      "type": "destination"
    }
  ],
  "walkingRoute": {
    "from": { "lat": 1.5584, "lon": 103.6378 },
    "to": { "lat": 1.5591, "lon": 103.6345 }
  },
  "alternativeBus": null
}
```

### DIRECT

Direct bus route without transfers.

```json
{
  "type": "DIRECT",
  "destination": {...},
  "summary": {
    "route": "Route A",
    "headsign": "To Arked",
    "departure": "08:30",
    "minutesUntil": 15,
    "departureDay": null,
    "busArrivalTime": "08:42",
    "totalDuration": 18,
    "eta": "08:45"
  },
  "steps": [
    {
      "type": "walk",
      "instruction": "Walk to Centre Point",
      "from": {...},
      "to": {...},
      "distance": 50,
      "duration": 1
    },
    {
      "type": "board",
      "instruction": "Board Route A (To Arked)",
      "stopName": "Centre Point",
      "stopId": "CP",
      "time": "08:30",
      "upcomingTimes": ["08:30", "09:00", "09:30"]
    },
    {
      "type": "ride",
      "instruction": "Ride 5 stops to P07",
      "duration": 12
    },
    {
      "type": "alight",
      "instruction": "Alight at P07",
      "stopName": "P07",
      "stopId": "P07",
      "time": "08:42"
    },
    {
      "type": "walk",
      "instruction": "Walk to Perpustakaan Sultanah Zanariah",
      "from": {...},
      "to": {...},
      "distance": 80,
      "duration": 1
    }
  ],
  "totalWalkingDistance": 130,
  "routeGeometry": {...},
  "originStop": {...},
  "destStop": {...}
}
```

### TRANSFER

Route requiring a bus transfer.

```json
{
  "type": "TRANSFER",
  "destination": {...},
  "summary": {
    "route": "Route A → Route E",
    "headsign": "To Arked → To KDOJ",
    "departure": "08:30",
    "transferAt": "Centre Point",
    "departureDay": null,
    "totalDuration": 28,
    "busArrivalTime": "08:55",
    "eta": "08:58"
  },
  "steps": [
    { "type": "walk", ... },
    { "type": "board", "instruction": "Board Route A (To Arked)", ... },
    { "type": "alight", "instruction": "Alight at Centre Point", ... },
    { "type": "board", "instruction": "Transfer to Route E (To KDOJ)", ... },
    { "type": "alight", ... },
    { "type": "walk", ... }
  ],
  "routeGeometries": {
    "firstLeg": {...},
    "secondLeg": {...}
  }
}
```

### Error Response

```json
{
  "error": "No route found",
  "suggestion": "No bus connection found from K9 to PSZ.",
  "debug": {
    "originStop": "K9",
    "destStop": "P07",
    "originServedBy": ["Route A", "Route B"],
    "destServedBy": ["Route A"]
  }
}
```

---

## Walking Step Types

| Type | Icon | Description |
|------|------|-------------|
| `depart` | 🚶 | Start walking |
| `destination` | 📍 | Arrive at destination |
| `straight` | ↑ | Continue straight |
| `turn_left` | ↰ | Turn left |
| `turn_right` | ↱ | Turn right |
| `turn_slight_left` | ↖ | Slight left |
| `turn_slight_right` | ↗ | Slight right |
| `u_turn` | ↩ | U-turn |
