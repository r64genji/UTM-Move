# UTM Move 🚌

A modern bus navigation web application for Universiti Teknologi Malaysia (UTM) campus. Get real-time bus schedules, route information, and step-by-step directions to any campus location.

![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![React](https://img.shields.io/badge/react-19.x-61dafb.svg)
![Express](https://img.shields.io/badge/express-5.x-000000.svg)

## Features

-  **Interactive Campus Map** - View all bus stops and routes on an interactive Leaflet map
-  **Real-time Bus Schedules** - Check when the next bus arrives at any stop
-  **Smart Directions** - Get optimal routes combining walking and bus travel
-  **Transfer Support** - Automatic transfer suggestions when direct routes aren't available
-  **Walking Directions** - Turn-by-turn walking instructions powered by GraphHopper
-  **Mobile-First PWA** - Responsive UI optimized for mobile with home screen installation
-  **Dark Mode** - Easy on the eyes dark theme

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.0 | UI framework |
| Vite | 7.2.4 | Build tool & dev server |
| Leaflet | 1.9.4 | Interactive map visualization |
| React-Leaflet | 5.0.0 | React bindings for Leaflet |
| Axios | 1.13.2 | HTTP client for API calls |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime environment |
| Express | 5.2.1 | REST API framework |
| Helmet | 8.1.0 | Security headers |
| Express Rate Limit | 8.2.1 | API rate limiting |
| Jest | 30.2.0 | Testing framework |

### External Services
| Service | Purpose |
|---------|---------|
| GraphHopper | Walking directions & routing |
| OpenStreetMap | Map tiles via Leaflet |
| Vercel | Frontend deployment |

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Local GraphHopper server at `http://localhost:8989` (for walking directions)

### Installation

```bash
# Clone the repository
git clone https://github.com/r64genji/UTM-Move.git
cd utm-move

# Install dependencies
cd Backend && npm install
cd ../Frontend && npm install
```

### Running the App

**Option 1: Full startup (recommended)**
```bash
# From project root
./start_public.bat
```

**Option 2: Manual startup**
```bash
# Terminal 1: Build frontend
cd Frontend
npm run build

# Terminal 2: Start server
cd Backend
node server.js
```

Then open `http://localhost:3000` in your browser.

## Project Structure

```
UTM Move/
├── Backend/                 # Express.js API server
│   ├── server.js           # Main server entry point
│   ├── data/               # JSON data files
│   │   ├── schedule.json           # Bus schedules
│   │   ├── campus_locations.json   # Campus locations (243KB)
│   │   ├── route_geometries.json   # Route paths (236KB)
│   │   ├── route_durations.json    # Travel times
│   │   └── geometry_manifest.json  # Geometry metadata
│   ├── directions/         # Modular routing engine (8 modules)
│   │   ├── index.js            # Main orchestrator
│   │   ├── dataLoader.js       # Data loading & caching
│   │   ├── locationService.js  # Location lookups
│   │   ├── routeFinder.js      # Route discovery
│   │   ├── routingEngine.js    # A* pathfinding & scoring
│   │   ├── scheduler.js        # Departure times
│   │   ├── responseBuilder.js  # Response formatting
│   │   └── walkingService.js   # GraphHopper walking directions
│   ├── tests/              # Jest test files (13 test suites, 65 tests)
│   ├── scripts/            # Utility scripts (32 scripts)
│   └── utils/              # Shared utilities
│
├── Frontend/               # React (Vite) frontend
│   ├── src/
│   │   ├── App.jsx             # Main app component
│   │   ├── components/         # UI components (10 shared)
│   │   │   └── mobile/         # Mobile-specific pages (9)
│   │   ├── services/api.js     # API client
│   │   └── utils/              # Frontend utilities
│   └── dist/               # Production build
│
├── graphhopper/            # Local GraphHopper server
│   ├── graphhopper-web-11.0.jar
│   ├── config.yml
│   └── malaysia-singapore-brunei-latest.osm.pbf
│
├── docs/                   # Additional documentation
│   └── API.md              # Detailed API reference
│
├── start_public.bat        # Full startup script
├── start_dev.bat           # Development startup
└── README.md               # This file
```

## API Reference

### `GET /api/static-data`

Returns all static data (stops, routes, schedules, geometries).

**Response:**
```json
{
  "stops": [...],
  "routes": [...],
  "route_geometries": {...},
  "locations": [...]
}
```

### `GET /api/next-bus`

Get the next bus for a specific route.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `route` | string | Route name (e.g., "Route A") |
| `time` | string | Current time "HH:MM" |
| `stop` | string | Optional stop filter |

### `GET /api/directions`

Get directions from origin to destination.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `originLat` | number | Origin latitude |
| `originLon` | number | Origin longitude |
| `destLocationId` | string | Destination location ID |
| `time` | string | Current time "HH:MM" |
| `day` | string | Optional day override |
| `forceBus` | boolean | Force bus route |

**Response Types:**
- `WALK_ONLY` - Walking is the best option
- `DIRECT` - Direct bus route available
- `BUS_ROUTE` - Bus + walking combination
- `TRANSFER` - Requires bus transfer

See [docs/API.md](docs/API.md) for full API documentation.

## Configuration

### Environment Variables

Create `.env` in the Frontend directory:

```env
VITE_API_URL=http://localhost:3000/api
```

### GraphHopper Server

The app uses a local GraphHopper server for walking directions. Configure via environment variable:

```env
# Backend/.env
GRAPHHOPPER_URL=http://localhost:8989
```

To start GraphHopper:
```bash
cd graphhopper
run.bat
```

## Data Files

### schedule.json

Contains all bus routes, services, and schedules:

```json
{
  "stops": [
    { "id": "CP", "name": "Centre Point", "lat": 1.5584, "lon": 103.6378 }
  ],
  "routes": [
    {
      "name": "Route A",
      "services": [
        {
          "service_id": "WEEKDAY",
          "days": ["monday", "tuesday", ...],
          "trips": [
            {
              "headsign": "To Arked",
              "stops_sequence": ["CP", "K9", ...],
              "times": ["07:00", "07:30", ...]
            }
          ]
        }
      ]
    }
  ]
}
```

### campus_locations.json

Points of interest on campus:

```json
{
  "locations": [
    {
      "id": "PSZ",
      "name": "Perpustakaan Sultanah Zanariah",
      "lat": 1.5591,
      "lon": 103.6345,
      "category": "library",
      "nearestStop": "P07"
    }
  ]
}
```

## Testing

```bash
cd Backend
npm test
```

65 tests across 13 suites cover:
- Direction logic
- Schedule parsing
- Geo calculations
- Route finding
- Service availability
- Security middleware

## Development

### Adding New Routes

1. Edit `Backend/data/schedule.json`
2. Run `update_geometries.bat` to generate the routes and update `route_geometries.json`

### Adding New Locations

1. Add entries to `Backend/data/campus_locations.json`
2. Include `nearestStop` for optimal routing

### Developer Tools

Press `Ctrl+Shift+D` in the app to open the developer panel for:
- Time override testing
- Day override testing
- Quick presets (Friday prayer, weekends, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgments

- UTM for route and schedule data
- Lee Zhi Xuan's Youtube Channel (halo budy) for recording the bus routes and uploading them to youtube
- [GraphHopper](https://www.graphhopper.com/) for walking directions
- [Leaflet](https://leafletjs.com/) and [OpenStreetMap](https://www.openstreetmap.org/) for maps
- [React](https://react.dev/) and [Vite](https://vitejs.dev/)
