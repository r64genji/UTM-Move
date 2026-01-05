import { useState, useEffect } from 'react';
import './index.css';
import { fetchStaticData, fetchDirections } from './services/api';
import { fetchRouteGeom, fetchWalkingRoute } from './utils/osrm';
import { extractDirectedRouteSegment } from './utils/routeGeometryUtils';
import MapComponent from './components/Map';
import RouteSelector from './components/RouteSelector';
import ServiceSelector from './components/ServiceSelector';
import ScheduleView from './components/ScheduleView';
import DirectionSelector from './components/DirectionSelector';
import SearchBar from './components/SearchBar';
import DirectionsPanel from './components/DirectionsPanel';

const ROUTE_COLORS = {
  'A': '#EF4444', // Red
  'B': '#F59E0B', // Amber
  'C': '#10B981', // Emerald
  'D': '#3B82F6', // Blue
  'E': '#8B5CF6', // Violet
  'F': '#EC4899', // Pink
  'G': '#14b8a6', // Teal
  'L': '#6366F1'  // Indigo
};

const getRouteColor = (routeStr) => {
  if (!routeStr) return '#3b82f6';
  const match = routeStr.match(/Route\s+([A-Z])/i);
  const letter = match ? match[1].toUpperCase() : 'A';
  return ROUTE_COLORS[letter] || '#3b82f6';
};

function App() {
  const [data, setData] = useState({ stops: [], routes: [], locations: [] });
  const [selectedRouteName, setSelectedRouteName] = useState(null);
  const [selectedHeadsign, setSelectedHeadsign] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [loading, setLoading] = useState(true);

  const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
  const [showAllStops, setShowAllStops] = useState(false);

  // Directions mode state
  const [mode, setMode] = useState('explore'); // 'explore' | 'directions'
  const [userLocation, setUserLocation] = useState(null);
  const [customOrigin, setCustomOrigin] = useState(null);
  const [directions, setDirections] = useState(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [walkingGeometries, setWalkingGeometries] = useState([]);
  const [busRouteGeometry, setBusRouteGeometry] = useState(null); // Legacy (single color)
  const [busRouteSegments, setBusRouteSegments] = useState([]);   // New (multi color)
  const [directionsMarkers, setDirectionsMarkers] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);

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

  // Get user's GPS location
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => {
          console.warn('Could not get location:', error);
        }
      );
    }
  }, []);

  // When route changes, pick default headsign
  const handleRouteSelect = (routeName) => {
    setSelectedRouteName(routeName);
    const route = data.routes.find(r => r.name === routeName);
    if (!route) return;

    const defaultServiceIndex = 0;
    setSelectedServiceIndex(defaultServiceIndex);
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

    const specificKey = `${routeName} : ${headsign}`;

    if (data.route_geometries) {
      if (data.route_geometries[specificKey]) {
        console.log("✅ Using MANUAL geometry override for:", specificKey);
        setRouteGeometry(data.route_geometries[specificKey]);
        return;
      }
      console.log("⚠️ No manual override found for:", specificKey, "-- Using OSRM.");
    }

    let targetTrip = null;
    const activeService = route.services[selectedServiceIndex];

    if (activeService) {
      targetTrip = activeService.trips.find(t => t.headsign === headsign);
    }

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

    let routeStopObjects = targetTrip.stops_sequence.map(id => data.stops.find(s => s.id === id)).filter(Boolean);

    if (data.route_waypoints && data.route_waypoints[specificKey]) {
      console.log("Applying waypoints for", specificKey);
      const waypoints = data.route_waypoints[specificKey];
      let enrichedStops = [];

      routeStopObjects.forEach(stop => {
        enrichedStops.push(stop);
        const relevantWaypoints = waypoints.filter(wp => wp.afterStopId === stop.id);
        relevantWaypoints.forEach(wp => {
          enrichedStops.push({ lat: wp.lat, lon: wp.lon, isWaypoint: true });
        });
      });

      routeStopObjects = enrichedStops;
    }

    const geometry = await fetchRouteGeom(routeStopObjects);
    setRouteGeometry(geometry);
  };

  // Directions mode handlers
  // Directions mode handlers
  const handleGetDirections = async (destination, options = {}) => {
    setSelectedDestination(destination);
    setDirectionsLoading(true);
    setDirections(null);
    setWalkingGeometries([]);
    setBusRouteGeometry(null);
    setBusRouteSegments([]);
    setDirectionsMarkers(null);

    try {
      const origin = customOrigin || userLocation;
      if (!origin) {
        setDirections({ error: 'Location not available', suggestion: 'Please enable GPS or select a starting point.' });
        return;
      }

      const currentTime = options.time || new Date().toTimeString().slice(0, 5);
      const params = {
        originLat: origin.lat,
        originLon: origin.lon,
        destLocationId: destination.id,
        time: currentTime,
        day: options.day,
        forceBus: options.forceBus
      };

      const result = await fetchDirections(params);
      setDirections(result);

      // Fetch walking geometries and set up map visualization
      if (result && !result.error) {
        const walkGeoms = [];

        // Find walking steps and fetch their geometries
        if (result.steps) {
          for (const step of result.steps) {
            if (step.type === 'walk' && step.from && step.to) {
              const walkRoute = await fetchWalkingRoute(step.from, step.to);
              if (walkRoute) {
                walkGeoms.push(walkRoute.geometry);
              }
            }
          }
        }

        // For WALK_ONLY type
        if (result.type === 'WALK_ONLY' && result.walkingRoute) {
          const walkRoute = await fetchWalkingRoute(result.walkingRoute.from, result.walkingRoute.to);
          if (walkRoute) {
            walkGeoms.push(walkRoute.geometry);
          }
        }

        setWalkingGeometries(walkGeoms);

        // Set bus route geometry (extract segment between stops)
        // Determine route colors
        const routeStr = result.summary.route || '';
        const routeParts = routeStr.split(/→|->/).map(s => s.trim());
        const color1 = getRouteColor(routeParts[0]);
        const color2 = routeParts.length > 1 ? getRouteColor(routeParts[1]) : color1;

        const newSegments = [];

        if (result.routeGeometry && result.originStop && result.destStop) {
          // Extract only the segment between origin and destination stops
          const segment = extractDirectedRouteSegment(
            result.routeGeometry,
            { lat: result.originStop.lat, lon: result.originStop.lon },
            { lat: result.destStop.lat, lon: result.destStop.lon }
          );
          if (segment) {
            setBusRouteGeometry(segment); // Keep legacy for fallback
            newSegments.push({
              coordinates: segment.coordinates,
              color: color1,
              type: 'bus'
            });
          } else {
            setBusRouteGeometry(result.routeGeometry);
          }
        } else if (result.isLoopRoute && result.routeGeometries && result.loopInfo) {
          // For loop routes, extract segments from each leg
          const transferStop = data.stops.find(s => s.id === result.loopInfo.transferPoint);

          // First leg
          if (result.routeGeometries.firstLeg && result.originStop && transferStop) {
            const seg1 = extractDirectedRouteSegment(
              result.routeGeometries.firstLeg,
              { lat: result.originStop.lat, lon: result.originStop.lon },
              { lat: transferStop.lat, lon: transferStop.lon }
            );
            if (seg1?.coordinates) {
              newSegments.push({ coordinates: seg1.coordinates, color: color1, type: 'bus' });
            }
          }

          // Second leg
          if (result.routeGeometries.secondLeg && transferStop && result.destStop) {
            const seg2 = extractDirectedRouteSegment(
              result.routeGeometries.secondLeg,
              { lat: transferStop.lat, lon: transferStop.lon },
              { lat: result.destStop.lat, lon: result.destStop.lon }
            );
            if (seg2?.coordinates) {
              newSegments.push({ coordinates: seg2.coordinates, color: color1, type: 'bus' }); // Loop usually same color
            }
          }

        } else if (result.routeGeometries) {
          // For transfer routes

          if (result.routeGeometries.firstLeg && result.originStop) {
            // First leg: origin stop to transfer point
            const transferId = result.transferPointId || 'CP';
            const transferStop = data.stops.find(s => s.id === transferId);

            if (transferStop) {
              const seg = extractDirectedRouteSegment(
                result.routeGeometries.firstLeg,
                { lat: result.originStop.lat, lon: result.originStop.lon },
                { lat: transferStop.lat, lon: transferStop.lon }
              );
              if (seg) newSegments.push({ coordinates: seg.coordinates, color: color1, type: 'bus' });
            }
          }

          if (result.routeGeometries.secondLeg && result.destStop) {
            // Second leg: transfer point to destination stop
            const transferId = result.transferPointId || 'CP';
            const transferStop = data.stops.find(s => s.id === transferId);

            if (transferStop) {
              const seg = extractDirectedRouteSegment(
                result.routeGeometries.secondLeg,
                { lat: transferStop.lat, lon: transferStop.lon },
                { lat: result.destStop.lat, lon: result.destStop.lon }
              );
              if (seg) newSegments.push({ coordinates: seg.coordinates, color: color2, type: 'bus' });
            }
          }
        }

        setBusRouteSegments(newSegments);

        // Set markers
        setDirectionsMarkers({
          destination: result.destination,
          originStop: result.originStop,
          destStop: result.destStop
        });
      }
    } catch (error) {
      console.error('Error getting directions:', error);
      setDirections({ error: 'Failed to get directions' });
    } finally {
      setDirectionsLoading(false);
    }
  };

  const handleSelectOrigin = (location) => {
    setCustomOrigin({
      lat: location.lat,
      lon: location.lon,
      name: location.name
    });
  };

  const handleUseCurrentLocation = () => {
    setCustomOrigin(null);
  };

  const handleCloseDirections = () => {
    setDirections(null);
    setWalkingGeometries([]);
    setBusRouteGeometry(null);
    setBusRouteSegments([]);
    setDirectionsMarkers(null);
  };

  const handlePlanFutureTrip = (day, time, isForceBus = false) => {
    console.log('DEBUG: handlePlanFutureTrip called', { day, time, isForceBus, hasSelectedDest: !!selectedDestination });
    if (selectedDestination) {
      console.log('DEBUG: Retrying with forceBus');
      handleGetDirections(selectedDestination, { day, time, forceBus: isForceBus });
    } else {
      console.warn('DEBUG: No selectedDestination found');
    }
  };

  const selectedRouteData = data.routes.find(r => r.name === selectedRouteName);

  let selectedStopIds = [];
  let availableHeadsigns = [];
  let activeService = null;

  if (selectedRouteData) {
    activeService = selectedRouteData.services[selectedServiceIndex];

    if (activeService) {
      const heads = new Set();
      activeService.trips.forEach(t => heads.add(t.headsign));
      availableHeadsigns = Array.from(heads);

      if (selectedHeadsign) {
        const trip = activeService.trips.find(t => t.headsign === selectedHeadsign);
        if (trip) {
          selectedStopIds = trip.stops_sequence;
        }
      }
    }
  }

  let visibleStops = [];
  if (mode === 'explore') {
    if (showAllStops) {
      visibleStops = data.stops;
    } else if (selectedStopIds.length > 0) {
      visibleStops = data.stops.filter(s => selectedStopIds.includes(s.id));
    }
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
              {/* Mode Toggle */}
              <div className="mode-toggle">
                <button
                  className={`mode-btn ${mode === 'explore' ? 'active' : ''}`}
                  onClick={() => setMode('explore')}
                >
                  🗺️ Explore Routes
                </button>
                <button
                  className={`mode-btn ${mode === 'directions' ? 'active' : ''}`}
                  onClick={() => setMode('directions')}
                >
                  🧭 Get Directions
                </button>
              </div>

              {mode === 'explore' ? (
                <>
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
                </>
              ) : (
                <>
                  <SearchBar
                    locations={data.locations || []}
                    stops={data.stops || []}
                    onSelectDestination={handleGetDirections}
                    onSelectOrigin={handleSelectOrigin}
                    onUseCurrentLocation={handleUseCurrentLocation}
                    disabled={directionsLoading}
                  />

                  <DirectionsPanel
                    directions={directions}
                    onClose={handleCloseDirections}
                    loading={directionsLoading}
                    onPlanFutureTrip={handlePlanFutureTrip}
                  />
                </>
              )}
            </div>

            <div className="map-area">
              <MapComponent
                stops={visibleStops}
                selectedRouteStops={selectedStopIds}
                routeGeometry={mode === 'explore' ? routeGeometry : null}
                walkingGeometries={mode === 'directions' ? walkingGeometries : []}
                busRouteGeometry={mode === 'directions' ? busRouteGeometry : null}
                busRouteSegments={mode === 'directions' ? busRouteSegments : []}
                userLocation={mode === 'directions' ? (customOrigin || userLocation) : null}
                directionsMarkers={mode === 'directions' ? directionsMarkers : null}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
