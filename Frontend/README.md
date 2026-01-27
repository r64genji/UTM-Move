# Frontend Documentation

## Overview

React-based mobile-first frontend built with Vite. Features an interactive map, route explorer, and turn-by-turn navigation.

## Tech Stack

- **React 18** - UI framework
- **Vite 7** - Build tool
- **Leaflet** - Interactive maps
- **Axios** - API client
- **CSS** - Custom styling (no Tailwind)

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
│   ├── Map.jsx                 # Leaflet map component
│   ├── ReportDialog.jsx        # Issue reporting dialog
│   ├── RouteSelector.jsx       # Route dropdown
│   ├── ScheduleView.jsx        # Timetable display
│   ├── SearchBar.jsx           # Location search
│   ├── ServiceSelector.jsx     # Weekday/Weekend toggle
│   │
│   └── mobile/
│       ├── BottomNavigation.jsx    # Tab bar
│       ├── MobileApp.jsx           # Mobile router
│       ├── MobileHomePage.jsx      # Home with map
│       ├── MobileInfoPage.jsx      # Info/help page
│       ├── MobileNavigatePage.jsx  # Navigation view
│       ├── MobileProfilePage.jsx   # User profile/settings
│       ├── MobileRouteDetailPage.jsx # Route details
│       ├── MobileRoutesPage.jsx    # Route list
│       ├── MobileSearchPage.jsx    # Location search
│       └── MobileWelcomePage.jsx   # Onboarding
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

Leaflet map with:
- Bus stop markers
- Route polylines
- Walking path visualization
- User location
- Direction markers

### MobileNavigatePage.jsx

Navigation view with:
- Origin/destination inputs
- Draggable directions sheet
- Step-by-step instructions
- Walking direction rendering

### DevPanel.jsx

Developer tools (Ctrl+Shift+D):
- Time override
- Day override
- Quick presets

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

## Building

```bash
npm run build    # Production build
npm run dev      # Development server
```

## Route Colors

Defined in `constants.js`:

```javascript
export const ROUTE_COLORS = {
    'A': '#FF4444',  // Red
    'B': '#44AA44',  // Green
    'C': '#4444FF',  // Blue
    // ...
};

export function getRouteColor(routeName) {
    // Extract letter and return color
}
```
