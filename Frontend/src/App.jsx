import { useState, useEffect } from 'react';
import './index.css';
import { fetchStaticData } from './services/api';
import { fetchRouteGeom } from './utils/osrm';
import MapComponent from './components/Map';
import RouteSelector from './components/RouteSelector';
import ServiceSelector from './components/ServiceSelector';
import ScheduleView from './components/ScheduleView';
import DirectionSelector from './components/DirectionSelector';

function App() {
  const [data, setData] = useState({ stops: [], routes: [] });
  const [selectedRouteName, setSelectedRouteName] = useState(null);
  const [selectedHeadsign, setSelectedHeadsign] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [loading, setLoading] = useState(true);


  const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);

  const [showAllStops, setShowAllStops] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchStaticData();
        setData(result);
      } catch (error) {
        console.error("Failed to load data", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // When route changes, pick default headsign
  const handleRouteSelect = (routeName) => {
    setSelectedRouteName(routeName);
    // When selecting a route, we likely want to disable "Show All" to focus on the route, 
    // or keep it if the user wants context? 
    // User said: "stops to be shown only when the user clicks on one of the routes".
    // Let's turn off showAllStops when a route is selected for clarity, or leave it independent.
    // Let's leave it independent but filter what is passed to the map.

    const route = data.routes.find(r => r.name === routeName);
    if (!route) return;

    // Reset service index to 0 (default)
    const defaultServiceIndex = 0;
    setSelectedServiceIndex(defaultServiceIndex);

    // Get headsigns for the default service
    updateHeadsignsForService(route, defaultServiceIndex);
  };

  const updateHeadsignsForService = (route, serviceIdx) => {
    const service = route.services[serviceIdx];
    if (!service) {
      handleDirectionSelect(route.name, null);
      return;
    }

    const headsigns = new Set();
    service.trips.forEach(trip => headsigns.add(trip.headsign));
    const headsignArray = Array.from(headsigns);

    // Default to first headsign
    const defaultHeadsign = headsignArray.length > 0 ? headsignArray[0] : null;
    handleDirectionSelect(route.name, defaultHeadsign);
  };

  const handleServiceSelect = (index) => {
    setSelectedServiceIndex(index);
    const route = data.routes.find(r => r.name === selectedRouteName);
    if (route) {
      updateHeadsignsForService(route, index);
    }
  };

  const handleDirectionSelect = async (routeName, headsign) => {
    setSelectedHeadsign(headsign);
    setRouteGeometry(null);

    const route = data.routes.find(r => r.name === routeName);
    if (!route) return;

    // Check for manual override: try "Route: Headsign" first, then "Route"
    const specificKey = `${routeName} : ${headsign}`;
    const genericKey = routeName;

    if (data.route_geometries) {
      if (data.route_geometries[specificKey]) {
        console.log("✅ Using MANUAL geometry override for:", specificKey);
        setRouteGeometry(data.route_geometries[specificKey]);
        return;
      }
      console.log("⚠️ No manual override found for:", specificKey, "-- Using OSRM.");  // Maybe don't fallback to generic key if we want direction precision? 
      // But for backwards compatibility or lazy editing, maybe? 
      // Let's NOT fallback to generic key if specific behavior is expected, 
      // to avoid showing the wrong direction path.
    }

    // Find the trip within the CURRENT selected service first
    let targetTrip = null;
    const activeService = route.services[selectedServiceIndex];

    if (activeService) {
      targetTrip = activeService.trips.find(t => t.headsign === headsign);
    }

    // If not found in active service (shouldn't happen if filtered correctly, but as fallback),
    // search in other services.
    if (!targetTrip) {
      for (const service of route.services) {
        const found = service.trips.find(t => t.headsign === headsign);
        if (found) {
          targetTrip = found;
          break;
        }
      }
    }

    if (!targetTrip) return;

    // Map stop IDs to Stop Objects
    let routeStopObjects = targetTrip.stops_sequence.map(id => data.stops.find(s => s.id === id)).filter(Boolean);

    // Check for Waypoints (Partial Correction)
    if (data.route_waypoints && data.route_waypoints[specificKey]) {
      console.log("Applying waypoints for", specificKey);
      const waypoints = data.route_waypoints[specificKey];

      // We need to inject waypoints AFTER specific stops.
      // We act on a *copy* of the array or build a new one.
      let enrichedStops = [];

      routeStopObjects.forEach(stop => {
        enrichedStops.push(stop);

        // key is "afterStopId"
        const relevantWaypoints = waypoints.filter(wp => wp.afterStopId === stop.id);
        relevantWaypoints.forEach(wp => {
          enrichedStops.push({ lat: wp.lat, lon: wp.lon, isWaypoint: true });
        });
      });

      routeStopObjects = enrichedStops;
    }

    // Fetch geometry
    const geometry = await fetchRouteGeom(routeStopObjects);
    setRouteGeometry(geometry);
  };

  const selectedRouteData = data.routes.find(r => r.name === selectedRouteName);

  // Get currently selected stops for highlighting based on HEADSIGN
  let selectedStopIds = [];
  let availableHeadsigns = [];
  let activeService = null;

  if (selectedRouteData) {
    activeService = selectedRouteData.services[selectedServiceIndex];

    if (activeService) {
      // Get headsigns just for this service
      const heads = new Set();
      activeService.trips.forEach(t => heads.add(t.headsign));
      availableHeadsigns = Array.from(heads);

      // Get stops for current headsign
      if (selectedHeadsign) {
        const trip = activeService.trips.find(t => t.headsign === selectedHeadsign);
        if (trip) {
          selectedStopIds = trip.stops_sequence;
        }
      }
    }
  }

  // Determine which stops to show on the map
  let visibleStops = [];
  if (showAllStops) {
    visibleStops = data.stops;
  } else if (selectedStopIds.length > 0) {
    visibleStops = data.stops.filter(s => selectedStopIds.includes(s.id));
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>UTM Move Shuttle Tracker</h1>
      </header>

      <main className="app-content">
        {loading ? (
          <p>Loading data...</p>
        ) : (
          <>
            <div className="sidebar">
              <div className="controls">
                <button
                  className={`toggle-stops-btn ${showAllStops ? 'active' : ''}`}
                  onClick={() => setShowAllStops(!showAllStops)}
                >
                  {showAllStops ? "Hide All Stops" : "Show All Stops"}
                </button>
              </div>

              <RouteSelector
                routes={data.routes}
                selectedRoute={selectedRouteName}
                onSelectRoute={handleRouteSelect}
              />

              <ServiceSelector
                services={selectedRouteData?.services}
                activeIndex={selectedServiceIndex}
                onSelectService={handleServiceSelect}
              />

              <DirectionSelector
                headsigns={availableHeadsigns}
                selectedHeadsign={selectedHeadsign}
                onSelectHeadsign={(h) => handleDirectionSelect(selectedRouteName, h)}
              />

              <ScheduleView service={activeService} />
            </div>

            <div className="map-area">
              <MapComponent
                stops={visibleStops}
                selectedRouteStops={selectedStopIds}
                routeGeometry={routeGeometry}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
