# Data Files Documentation

## Overview

The `data/` folder contains all static data files used by UTM Move. Total size: ~560KB of structured JSON data.

## Files

### schedule.json (54KB)

Main schedule database with all routes, services, and trips.

```json
{
  "stops": [
    {
      "id": "CP",           // Unique identifier
      "name": "Centre Point",
      "lat": 1.5584,
      "lon": 103.6378
    }
  ],
  "routes": [
    {
      "name": "Route A",
      "services": [
        {
          "service_id": "WEEKDAY",
          "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
          "trips": [
            {
              "headsign": "To Arked",
              "stops_sequence": ["CP", "K9", "K10", "AM", "P07", "PSZ"],
              "times": ["07:00", "07:30", "08:00", "08:30"]
            }
          ]
        },
        {
          "service_id": "WEEKEND",
          "days": ["saturday", "sunday"],
          "trips": [...]
        }
      ]
    }
  ]
}
```

### campus_locations.json (243KB)

Points of interest on campus (libraries, faculties, buildings, etc).

```json
{
  "locations": [
    {
      "id": "PSZ",
      "name": "Perpustakaan Sultanah Zanariah",
      "lat": 1.5591,
      "lon": 103.6345,
      "category": "library",
      "nearestStop": "P07",
      "aliases": ["Library", "Main Library"]
    }
  ]
}
```

**Categories:**
| Category | Description |
|----------|-------------|
| `library` | Libraries |
| `faculty` | Faculty buildings |
| `hostel` | Student hostels (e.g., KTF, KTR, KTHO) |
| `food` | Cafeterias and food courts |
| `admin` | Administrative buildings |
| `facility` | Sports, labs, and other facilities |
| `bus_stop` | Bus stops (auto-generated from schedule.json) |

### route_geometries.json (237KB)

Pre-cached route paths as GeoJSON LineStrings for map visualization.

```json
{
  "Route A : To Arked": {
    "type": "LineString",
    "coordinates": [
      [103.6378, 1.5584],
      [103.6389, 1.5590],
      ...
    ]
  }
}
```

Key format: `"Route Name : Headsign"`

### geometry_manifest.json

Metadata about route geometries for cache management.

```json
{
  "Route A : To Arked": {
    "lastUpdated": "2025-12-01T10:30:00Z",
    "source": "graphhopper"
  }
}
```

### utm polygon.geojson (1KB)

GeoJSON polygon defining UTM campus boundaries. Used for location validation and map highlighting.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [...]
  }
}
```

### route_durations.json (23KB)

Travel time estimates per route segment, used for ETA calculations.

```json
{
  "Route A_To Arked": {
    "totalDistance": 5200,
    "totalTime": 720,
    "segments": [
      { "from": "CP", "to": "K9", "distance": 500, "totalSecs": 60 },
      { "from": "K9", "to": "K10", "distance": 300, "totalSecs": 45 }
    ]
  }
}
```

### route_waypoints.json

Manual waypoints for accurate route visualization (when GraphHopper routing needs adjustment).

```json
{
  "Route E : To KDOJ": [
    { "afterStopId": "CP", "lat": 1.5585, "lon": 103.6380 },
    { "afterStopId": "K9", "lat": 1.5595, "lon": 103.6392 }
  ]
}
```

## Updating Data

### Add a new route

1. Add stops to `schedule.json` → `stops` array
2. Add route to `schedule.json` → `routes` array
3. Run geometry generation:
   ```bash
   cd Backend
   .\update_geometries.bat
   ```

### Add a new location

1. Add to `campus_locations.json`
2. Include `nearestStop` for optimal routing
3. Add relevant `aliases` for search

Example:
```json
{
  "id": "NEW_BUILDING",
  "name": "New Faculty Building",
  "lat": 1.5600,
  "lon": 103.6400,
  "category": "faculty",
  "nearestStop": "P07",
  "aliases": ["NFB", "New Building"]
}
```

### Regenerate route geometry

```bash
cd Backend/scripts
node regenerate-route.js "Route A : To Arked"
```

Or regenerate all routes:
```bash
cd Backend
.\update_geometries.bat
```

## Validation

Run validation script to check data integrity:

```bash
cd Backend/scripts
node validate_schedule.js
```

This checks for:
- Stop ID consistency
- Valid GPS coordinates
- Schedule time format
- Route geometry completeness
