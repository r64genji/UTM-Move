import React, { useState, useEffect } from 'react';
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
import MobileApp from './components/mobile/MobileApp';

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

// Helper to safely get route from data
const findRoute = (data, name) => {
    if (!data || !data.routes) return null;
    return data.routes.find(r => r.name === name);
};

function App() {
    const [data, setData] = useState({ stops: [], routes: [], locations: [], route_geometries: {}, route_waypoints: {} });
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

    // Mobile viewport detection
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const loadData = async () => {
            try {
                const result = await fetchStaticData();
                setData({
                    stops: result?.stops || [],
                    routes: result?.routes || [],
                    locations: result?.locations || [],
                    route_geometries: result?.route_geometries || {},
                    route_waypoints: result?.route_waypoints || {}
                });
            } catch (err) {
                console.error("Failed to load static data", err);
                // Ensure state is at least valid
                setData({ stops: [], routes: [], locations: [] });
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
    // When route changes, pick default headsign
    const handleRouteSelect = async (routeName, serviceId = 'WEEKDAY', showLoop = false) => {
        // Clear geometry if no route selected
        if (!routeName) {
            setSelectedRouteName(null);
            setRouteGeometry(null);
            return;
        }

        setSelectedRouteName(routeName);
        const route = data.routes.find(r => r.name === routeName);
        if (!route) return;

        let serviceIndex = 0;
        if (serviceId) {
            const idx = route.services.findIndex(s => s.service_id === serviceId);
            if (idx !== -1) serviceIndex = idx;
        }

        setSelectedServiceIndex(serviceIndex);

        if (showLoop) {
            // Show full loop: fetch geometries for ALL unique headsigns
            // Clear specific headsign selection
            setSelectedHeadsign(null);

            const service = route.services[serviceIndex];
            if (!service) return;

            const headsigns = [...new Set(service.trips.map(t => t.headsign))];
            const geometryPromises = headsigns.map(async (headsign) => {
                const specificKey = `${routeName} : ${headsign}`;

                // Try to get from static data first
                if (data.route_geometries && data.route_geometries[specificKey]) {
                    return data.route_geometries[specificKey];
                }

                // Fallback to OSRM fetch
                const trip = service.trips.find(t => t.headsign === headsign);
                if (!trip) return null;

                const routeStopObjects = trip.stops_sequence.map(id => data.stops.find(s => s.id === id)).filter(Boolean);

                // Enrich with waypoints if available
                let stopList = routeStopObjects;
                if (data.route_waypoints && data.route_waypoints[specificKey]) {
                    const waypoints = data.route_waypoints[specificKey];
                    let enriched = [];
                    stopList.forEach(stop => {
                        enriched.push(stop);
                        const wps = waypoints.filter(wp => wp.afterStopId === stop.id);
                        wps.forEach(wp => enriched.push({ lat: wp.lat, lon: wp.lon, isWaypoint: true }));
                    });
                    stopList = enriched;
                }

                return await fetchRouteGeom(stopList);
            });

            const geometries = await Promise.all(geometryPromises);
            const validGeometries = geometries.filter(Boolean);

            // Combine into MultiLineString
            const multiLineGeometry = {
                type: 'MultiLineString',
                coordinates: validGeometries.map(g => g.coordinates)
            };

            setRouteGeometry(multiLineGeometry);

        } else {
            // Default behavior: Select first headsign
            updateHeadsignsForService(route, serviceIndex);
        }
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
        console.log('Looking for geometry key:', specificKey);

        if (data.route_geometries) {
            console.log('Geometries available, keys:', Object.keys(data.route_geometries).length);
            if (data.route_geometries[specificKey]) {
                console.log('Found geometry in JSON!');
                setRouteGeometry(data.route_geometries[specificKey]);
                return;
            } else {
                console.log('Geometry NOT found for key:', specificKey);
            }
        } else {
            console.log('No route_geometries in data');
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

    const handleGetDirections = async (destination, options = {}) => {
        setMode('directions');
        setSelectedDestination(destination);
        setDirectionsLoading(true);
        setDirections(null);
        setWalkingGeometries([]);
        setBusRouteGeometry(null);
        setBusRouteSegments([]);
        setDirectionsMarkers(null);

        try {
            // Use overrideOrigin if provided (fixes stale closure issue when changing origin)
            const origin = options.overrideOrigin || customOrigin || userLocation;
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

            if (result && !result.error) {
                const walkGeoms = [];

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

                if (result.type === 'WALK_ONLY' && result.walkingRoute) {
                    const walkRoute = await fetchWalkingRoute(result.walkingRoute.from, result.walkingRoute.to);
                    if (walkRoute) {
                        walkGeoms.push(walkRoute.geometry);
                    }
                }

                setWalkingGeometries(walkGeoms);

                // Handle bus route colors (only if there's a bus route)
                const routeStr = result.summary?.route || '';
                const routeParts = routeStr.split(/→|->/).map(s => s.trim()).filter(Boolean);
                const color1 = getRouteColor(routeParts[0]);
                const color2 = routeParts.length > 1 ? getRouteColor(routeParts[1]) : color1;

                const newSegments = [];

                if (result.routeGeometry && result.originStop && result.destStop) {
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
                        newSegments.push({ coordinates: result.routeGeometry.coordinates, color: color1, type: 'bus' });
                    }
                } else if (result.isLoopRoute && result.routeGeometries && result.loopInfo) {
                    const transferStop = data.stops.find(s => s.id === result.loopInfo.transferPoint);

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

                    if (result.routeGeometries.secondLeg && transferStop && result.destStop) {
                        const seg2 = extractDirectedRouteSegment(
                            result.routeGeometries.secondLeg,
                            { lat: transferStop.lat, lon: transferStop.lon },
                            { lat: result.destStop.lat, lon: result.destStop.lon }
                        );
                        if (seg2?.coordinates) {
                            newSegments.push({ coordinates: seg2.coordinates, color: color2, type: 'bus' });
                        }
                    }

                } else if (result.routeGeometries) {
                    const legs = routeStr.split(/→|->/).map(s => s.trim());
                    const firstLegColor = getRouteColor(legs[0]);
                    const secondLegColor = legs.length > 1 ? getRouteColor(legs[1]) : firstLegColor;

                    if (result.routeGeometries.firstLeg && result.originStop) {
                        const transferId = result.transferPointId || 'CP';
                        const transferStop = data.stops.find(s => s.id === transferId);

                        if (transferStop) {
                            const seg = extractDirectedRouteSegment(
                                result.routeGeometries.firstLeg,
                                { lat: result.originStop.lat, lon: result.originStop.lon },
                                { lat: transferStop.lat, lon: transferStop.lon }
                            );
                            if (seg) {
                                newSegments.push({ coordinates: seg.coordinates, color: firstLegColor, type: 'bus' });
                            } else {
                                newSegments.push({ coordinates: result.routeGeometries.firstLeg.coordinates, color: firstLegColor, type: 'bus' });
                            }
                        }
                    }

                    if (result.routeGeometries.secondLeg && result.destStop) {
                        const transferId = result.transferPointId || 'CP';
                        const transferStop = data.stops.find(s => s.id === transferId);

                        if (transferStop) {
                            const seg = extractDirectedRouteSegment(
                                result.routeGeometries.secondLeg,
                                { lat: transferStop.lat, lon: transferStop.lon },
                                { lat: result.destStop.lat, lon: result.destStop.lon }
                            );
                            if (seg) {
                                newSegments.push({ coordinates: seg.coordinates, color: secondLegColor, type: 'bus' });
                            } else {
                                newSegments.push({ coordinates: result.routeGeometries.secondLeg.coordinates, color: secondLegColor, type: 'bus' });
                            }
                        }
                    }
                }
                setBusRouteSegments(newSegments);

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
        if (!location) {
            setCustomOrigin(null);
            // Recalculate with GPS location if destination exists
            if (selectedDestination && userLocation) {
                handleGetDirections(selectedDestination, { overrideOrigin: userLocation });
            }
            return;
        }
        const newOrigin = {
            lat: location.lat,
            lon: location.lon,
            name: location.name
        };
        setCustomOrigin(newOrigin);

        // Recalculate directions with new origin if destination exists
        // Pass newOrigin directly to avoid stale closure issue
        if (selectedDestination) {
            handleGetDirections(selectedDestination, { overrideOrigin: newOrigin });
        }
    };

    const handleUseCurrentLocation = () => {
        setCustomOrigin(null);
    };

    const handleCloseDirections = () => {
        setMode('explore');
        setDirections(null);
        setWalkingGeometries([]);
        setBusRouteGeometry(null);
        setBusRouteSegments([]);
        setDirectionsMarkers(null);
    };

    const handlePlanFutureTrip = (day, time, isForceBus = false) => {
        if (selectedDestination) {
            handleGetDirections(selectedDestination, { day, time, forceBus: isForceBus });
        }
    };

    const selectedRouteData = findRoute(data, selectedRouteName);
    let selectedStopIds = [];
    let activeService = null;
    let availableHeadsigns = [];

    if (selectedRouteData && selectedRouteData.services) {
        activeService = selectedRouteData.services[selectedServiceIndex];
        if (activeService && activeService.trips) {
            availableHeadsigns = [...new Set(activeService.trips.map(t => t.headsign))];

            if (!selectedHeadsign && availableHeadsigns.length > 0 && mode !== 'explore') {
                // Only auto-select if NOT in explore mode (or if we want to enforce it, but we want to allow null for "All" view)
                // Actually, if we are in "All headsigns" mode (routeGeometry is MultiLineString), we want selectedHeadsign to be null.
                // The issue is this effect runs on every render.
                // If we explicitly set it to null in handleRouteSelect(showLoop=true), this might override it back.
                // Let's rely on explicit user action or handleRouteSelect to set it. We shouldn't auto-set it here unless it's undefined/null AND we want a default.
                // But for "Show Loop" feature, we intentionally want it null.

                // For now, let's DISABLE this auto-selection here, as handleRouteSelect handles the default case.

                // const firstHeadsign = availableHeadsigns[0];
                // setTimeout(() => setSelectedHeadsign(firstHeadsign), 0);
            }

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
            visibleStops = data?.stops || [];
        } else if (selectedStopIds.length > 0) {
            visibleStops = (data?.stops || []).filter(s => selectedStopIds.includes(s.id));
        }
    }

    if (loading) {
        return (
            <div className="loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-dark)', color: 'white' }}>
                <div className="loading-spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ marginTop: '16px', fontWeight: '500' }}>Loading UTM Move...</p>
            </div>
        );
    }

    // Render mobile app for small screens
    if (isMobile) {
        return (
            <MobileApp
                data={data}
                userLocation={customOrigin || userLocation}
                onGetDirections={handleGetDirections}
                onSelectOrigin={handleSelectOrigin}
                onSelectRoute={handleRouteSelect}
                onDirectionSelect={handleDirectionSelect}
                mode={mode}
                visibleStops={visibleStops}
                selectedStopIds={selectedStopIds}
                routeGeometry={routeGeometry}
                selectedServiceIndex={selectedServiceIndex}
                walkingGeometries={walkingGeometries}
                busRouteGeometry={busRouteGeometry}
                busRouteSegments={busRouteSegments}
                directionsMarkers={directionsMarkers}
                directions={directions}
                directionsLoading={directionsLoading}
                onCloseDirections={handleCloseDirections}
                onPlanFutureTrip={handlePlanFutureTrip}
            />
        );
    }

    return (
        <div className="app-container">
            {/* Sidebar */}
            <aside className="app-sidebar">
                <div className="sidebar-header">
                    <h1 className="brand">
                        <span className="material-icons-round" style={{ color: 'var(--color-primary)', fontSize: '24px' }}>directions_bus</span>
                        UTM Move
                    </h1>
                </div>

                <div className="sidebar-content">
                    {/* Mode Switcher */}
                    <div className="mode-switcher">
                        <button
                            className={`mode-btn ${mode === 'explore' ? 'active' : ''}`}
                            onClick={() => setMode('explore')}
                        >
                            <span className="material-icons-round">map</span>
                            Routes
                        </button>
                        <button
                            className={`mode-btn ${mode === 'directions' ? 'active' : ''}`}
                            onClick={() => setMode('directions')}
                        >
                            <span className="material-icons-round">near_me</span>
                            Directions
                        </button>
                    </div>

                    <button
                        className="mode-btn"
                        style={{ width: '100%', justifyContent: 'space-between', background: 'var(--surface-dark)', border: '1px solid var(--border-color)' }}
                        onClick={() => setShowAllStops(!showAllStops)}
                    >
                        <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span className="material-icons-round" style={{ color: showAllStops ? 'var(--color-primary)' : 'var(--text-muted)' }}>visibility</span>
                            {showAllStops ? "Hide All Stops" : "Show All Stops"}
                        </span>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>chevron_right</span>
                    </button>

                    {mode === 'explore' ? (
                        <>
                            <div className="section-title">
                                <span>Select a Route</span>
                                <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px', fontSize: '10px' }}>
                                    {(data?.routes || []).length} Active
                                </span>
                            </div>

                            <div className="route-grid">
                                {(data?.routes || []).map(route => (
                                    <div
                                        key={route.name}
                                        className={`route-card ${selectedRouteName === route.name ? 'active' : ''}`}
                                        onClick={() => handleRouteSelect(route.name)}
                                    >
                                        <div className="route-card-header">
                                            <span className="route-name">{route.name}</span>
                                            <div className="status-dot" style={{ backgroundColor: getRouteColor(route.name), boxShadow: `0 0 8px ${getRouteColor(route.name)}` }}></div>
                                        </div>
                                        <span className="route-desc">
                                            {route.services[0]?.trips[0]?.headsign || "View Schedule"}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {selectedRouteName && (
                                <div style={{ marginTop: '1rem' }}>
                                    <ServiceSelector
                                        services={selectedRouteData?.services}
                                        activeIndex={selectedServiceIndex}
                                        onSelectService={handleServiceSelect}
                                    />
                                    <div style={{ marginTop: '0.5rem' }}></div>
                                    <DirectionSelector
                                        headsigns={availableHeadsigns}
                                        selectedHeadsign={selectedHeadsign}
                                        onSelectHeadsign={(h) => handleDirectionSelect(selectedRouteName, h)}
                                    />
                                    <ScheduleView service={activeService} stops={data?.stops || []} currentHeadsign={selectedHeadsign} />
                                </div>
                            )}

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

                <div className="sidebar-footer">
                    <span>© UTM 2026</span>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <span>Help</span>
                        <span>Feedback</span>
                    </div>
                </div>
            </aside>

            {/* Map Area */}
            <main className="map-area">
                {/* Floating Controls */}
                <div className="floating-tools">
                    <button className="tool-btn" onClick={() => { /* Zoom In placeholder */ }}>
                        <span className="material-icons-round">add</span>
                    </button>
                    <button className="tool-btn" onClick={() => { /* Zoom Out placeholder */ }}>
                        <span className="material-icons-round">remove</span>
                    </button>
                    <button className="tool-btn">
                        <span className="material-icons-round">my_location</span>
                    </button>
                </div>

                {/* Map */}
                <div style={{ height: '100%', width: '100%' }}>
                    <MapComponent
                        stops={visibleStops}
                        selectedRouteStops={selectedStopIds}
                        routeGeometry={mode === 'explore' ? routeGeometry : null}
                        routeColor={getRouteColor(selectedRouteName)}
                        walkingGeometries={mode === 'directions' ? walkingGeometries : []}
                        busRouteGeometry={mode === 'directions' ? busRouteGeometry : null}
                        busRouteSegments={mode === 'directions' ? busRouteSegments : []}
                        userLocation={mode === 'directions' ? (customOrigin || userLocation) : null}
                        directionsMarkers={mode === 'directions' ? directionsMarkers : null}
                    />
                </div>

                {/* Legend */}
                <div className="legend-card">
                    <div className="legend-item">
                        <div className="dot" style={{ background: '#22c55e' }}></div>
                        <span>Active</span>
                    </div>
                    <div className="legend-item">
                        <div className="dot" style={{ background: '#eab308' }}></div>
                        <span>Delayed</span>
                    </div>
                    <div className="legend-item">
                        <div className="dot" style={{ background: '#9ca3af' }}></div>
                        <span>Inactive</span>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
