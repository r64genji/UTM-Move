# Frontend Documentation

## Overview

React-based mobile-first Progressive Web App built with Vite. Features an interactive map, route explorer, and turn-by-turn navigation for UTM campus buses.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.0 | UI framework |
| Vite | 7.2.4 | Build tool & dev server |
| Leaflet | 1.9.4 | Interactive maps |
| React-Leaflet | 5.0.0 | React bindings for Leaflet |
| Axios | 1.13.2 | API client |
| ESLint | 9.39.1 | Code linting |

## Project Structure

```
src/
├── App.jsx                 # Main app component & routing logic
├── main.jsx               # React entry point
├── index.css              # Global styles + design system
├── constants.js           # Shared constants (colors, etc.)
│
├── components/
│   ├── AdminDashboard.jsx      # Admin tools
│   ├── DevPanel.jsx            # Developer tools (Ctrl+Shift+D)
│   ├── DirectionSelector.jsx   # Headsign selector
│   ├── DirectionsPanel.jsx     # Desktop directions
│   ├── Map.jsx                 # Leaflet map component (~31KB)
│   ├── ReportDialog.jsx        # Issue reporting dialog
│   ├── RouteSelector.jsx       # Route dropdown
│   ├── ScheduleView.jsx        # Timetable display
│   ├── SearchBar.jsx           # Location search
│   ├── ServiceSelector.jsx     # Weekday/Weekend toggle
│   │
│   └── mobile/                 # Mobile-specific pages (9 components)
│       ├── BottomNavigation.jsx    # Tab bar
│       ├── MobileApp.jsx           # Mobile router
│       ├── MobileHomePage.jsx      # Home with map & nearest stops
│       ├── MobileInfoPage.jsx      # Info/help page
│       ├── MobileNavigatePage.jsx  # Navigation view (~41KB)
│       ├── MobileProfilePage.jsx   # User profile/settings
│       ├── MobileRouteDetailPage.jsx # Route details (~36KB)
│       ├── MobileRoutesPage.jsx    # Route list
│       └── MobileSearchPage.jsx    # Location search
│
├── services/
│   └── api.js              # Backend API client
│
└── utils/
    └── routeGeometryUtils.js # Geometry helpers
```

## Key Components

### App.jsx

Main orchestrator handling:
- Route selection and geometry
- Direction requests
- Mobile/desktop detection
- State management

### Map.jsx

Leaflet map component with:
- Bus stop markers with interactive popups
- Route polylines with direction arrows
- Walking path visualization
- User location tracking
- Building labels at high zoom levels
- UTM area highlighting

### MobileNavigatePage.jsx

Full-featured navigation view with:
- Origin/destination inputs
- Draggable directions sheet
- Step-by-step instructions
- Walking direction rendering with elevation data
- Real-time ETA calculation

### MobileHomePage.jsx

Landing page featuring:
- Interactive campus map
- Nearest bus stops with upcoming arrivals
- Quick navigation buttons
- PWA install prompt

### DevPanel.jsx

Developer tools (Ctrl+Shift+D):
- Time override
- Day override
- Quick presets (Friday prayer, weekends, etc.)

## API Client

```javascript
// services/api.js
import { fetchStaticData, fetchDirections, fetchNextBus } from './services/api';

// Get all static data
const data = await fetchStaticData();

// Get directions
const directions = await fetchDirections({
    originLat: 1.55,
    originLon: 103.63,
    destLocationId: 'PSZ',
    time: '08:00'
});
```

## Routing Utilities

```javascript
// utils/routeGeometryUtils.js
import { extractDirectedRouteSegment } from './utils/routeGeometryUtils';

// Extract segment of route between two stops
const segment = extractDirectedRouteSegment(
    routeGeometry,
    originStop,
    destStop
);
```

## State Management

App.jsx manages core state:

```javascript
// Mode
const [mode, setMode] = useState('explore'); // 'explore' | 'directions'

// Route selection
const [selectedRouteName, setSelectedRouteName] = useState(null);
const [selectedHeadsign, setSelectedHeadsign] = useState(null);
const [routeGeometry, setRouteGeometry] = useState(null);

// Directions
const [directions, setDirections] = useState(null);
const [walkingGeometries, setWalkingGeometries] = useState([]);
const [busRouteSegments, setBusRouteSegments] = useState([]);

// Dev settings
const [devSettings, setDevSettings] = useState({
    enabled: false,
    time: '08:00',
    day: 'monday'
});
```

## Styling

Custom CSS design system in `index.css`:

```css
:root {
    --color-primary: #2563eb;
    --bg-dark: #101922;
    --text-primary: #ffffff;
    /* ... */
}
```

## PWA Features

The app supports Progressive Web App installation:
- Service worker for offline caching
- Home screen installation prompt
- Responsive mobile-first design
- Dark mode support

## Building

```bash
npm run build    # Production build → dist/
npm run dev      # Development server with hot reload
npm run preview  # Preview production build locally
npm run lint     # Run ESLint
```

## Environment Variables

Create `.env` file:

```env
VITE_API_URL=http://localhost:3000/api
```

For production deployment:
```env
VITE_API_URL=https://your-backend-domain.com/api
```

## Route Colors

Defined in `constants.js`:

```javascript
export const ROUTE_COLORS = {
    'A': '#FF4444',  // Red
    'B': '#44AA44',  // Green
    'C': '#4444FF',  // Blue
    'D': '#FF8800',  // Orange
    'E': '#AA44AA',  // Purple
    'F': '#00AAAA',  // Cyan
    'G': '#AAAA00',  // Yellow
    'H': '#FF44AA',  // Pink
    'J': '#44AAFF',  // Light Blue
    // ...
};

export function getRouteColor(routeName) {
    // Extract letter and return color
}
```

## Deployment

The frontend is deployed on Vercel. Configuration in `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

Build settings:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
