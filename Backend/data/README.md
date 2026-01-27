# Data Files Documentation

## Overview

The `data/` folder contains all static data files used by UTM Move.

## Files

### schedule.json

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

### campus_locations.json

Points of interest on campus (libraries, faculties, etc).

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
- `library` - Libraries
- `faculty` - Faculty buildings
- `hostel` - Student hostels
- `food` - Cafeterias
- `admin` - Administrative buildings
- `bus_stop` - Bus stops (auto-generated)

### route_geometries.json

Pre-cached route paths (GeoJSON LineStrings).

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

### utm polygon.geojson

GeoJSON polygon defining UTM campus boundaries. Used for location validation.

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [...]
  }
}
```

### route_durations.json

Travel time estimates per route segment.

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

Manual waypoints for accurate route visualization.

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
3. Generate geometry and add to `route_geometries.json`
4. Run `node importSchedule.js`

### Add a new location

1. Add to `campus_locations.json`
2. Include `nearestStop` for routing

### Regenerate route geometry

```bash
cd Backend/scripts
node regenerate-route.js "Route A : To Arked"
```

## Validation

```bash
cd Backend/scripts
python validate_schedule.py
```
