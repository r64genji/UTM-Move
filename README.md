# UTM Move 🚌

A modern bus navigation app for Universiti Teknologi Malaysia (UTM) campus. Get real-time bus schedules, route information, and step-by-step directions to any campus location.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![React](https://img.shields.io/badge/react-18.x-61dafb.svg)

## Features

- 🗺️ **Interactive Campus Map** - View all bus stops and routes on an interactive map
- 🚌 **Real-time Bus Schedules** - Check when the next bus arrives at any stop
- 📍 **Smart Directions** - Get optimal routes combining walking and bus travel
- 🔄 **Transfer Support** - Automatic transfer suggestions when direct routes aren't available
- 🚶 **Walking Directions** - Turn-by-turn walking instructions from ORS
- 🕌 **Friday Prayer Support** - Automatic service adjustments during Friday prayer time
- 📱 **Mobile-First Design** - Responsive UI optimized for mobile devices
- 🌙 **Dark Mode** - Easy on the eyes dark theme

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Local ORS server at `http://192.168.1.119:8082/ors/v2` (for walking directions)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/utm-move.git
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
│   │   ├── schedule.json       # Bus schedules
│   │   ├── campus_locations.json   # Campus locations
│   │   ├── route_geometries.json   # Route paths
│   │   └── route_durations.json    # Travel times
│   ├── directions/         # Modular routing engine
│   │   ├── index.js            # Main orchestrator
│   │   ├── dataLoader.js       # Data loading & caching
│   │   ├── locationService.js  # Location lookups
│   │   ├── routeFinder.js      # Route discovery
│   │   ├── scheduler.js        # Departure times
│   │   ├── routeScorer.js      # Route optimization
│   │   ├── responseBuilder.js  # Response formatting
│   │   └── walkingService.js   # ORS walking directions
│   ├── tests/              # Jest test files
│   ├── scripts/            # Utility scripts
│   └── utils/              # Shared utilities
│
├── Frontend/               # React (Vite) frontend
│   ├── src/
│   │   ├── App.jsx             # Main app component
│   │   ├── components/         # UI components
│   │   │   ├── mobile/         # Mobile-specific pages
│   │   │   └── *.jsx           # Shared components
│   │   ├── services/api.js     # API client
│   │   └── utils/              # Frontend utilities
│   └── dist/               # Production build
│
├── start_public.bat        # Full startup script
└── README.md              # This file
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

## Configuration

### Environment Variables

Create `.env` in the Frontend directory:

```env
VITE_API_URL=http://localhost:3000/api
```

### ORS Server

The app uses a local OpenRouteService server for walking directions. Configure the URL in:
- `Backend/directions/walkingService.js`
- `Backend/directions/locationService.js`
- `Frontend/src/utils/osrm.js`

```javascript
const ORS_BASE_URL = 'http://192.168.1.119:8082/ors/v2';
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

65 tests cover:
- Direction logic
- Schedule parsing
- Geo calculations
- Route finding
- Service availability

## Development

### Adding New Routes

1. Edit `Backend/data/schedule.json`
2. Run `node importSchedule.js` to update the database
3. Generate route geometry using ORS and add to `route_geometries.json`

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

## License

This project is licensed under the MIT License.

## Acknowledgments

- UTM for route and schedule data
- [OpenRouteService](https://openrouteservice.org/) for walking directions
- [Leaflet](https://leafletjs.com/) for maps
- [React](https://react.dev/) and [Vite](https://vitejs.dev/)
