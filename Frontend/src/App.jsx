import React, { useState, useEffect } from 'react';
import './index.css';
import { fetchStaticData } from './services/api';
import { getRouteColor } from './constants';
import MapComponent from './components/Map';
import RouteSelector from './components/RouteSelector';
import ServiceSelector from './components/ServiceSelector';
import ScheduleView from './components/ScheduleView';
import DirectionSelector from './components/DirectionSelector';
import MobileApp from './components/mobile/MobileApp';

// Helper to safely get route from data
const findRoute = (data, name) => {
    if (!data || !data.routes) return null;
    return data.routes.find(r => r.name === name);
};

function App() {

    const [data, setData] = useState({ stops: [], routes: [], locations: [], route_geometries: {} });
    const [selectedRouteName, setSelectedRouteName] = useState(null);
    const [selectedHeadsign, setSelectedHeadsign] = useState(null);
    const [routeGeometry, setRouteGeometry] = useState(null);
    const [loading, setLoading] = useState(true);

    const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
    const [showAllStops, setShowAllStops] = useState(false);

    // User GPS
    const [userLocation, setUserLocation] = useState(null);

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
            const CACHE_KEY = 'utm_static_data';
            const CACHE_TS_KEY = 'utm_static_data_ts';
            const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

            try {
                // 1. Try cache first
                const cachedData = localStorage.getItem(CACHE_KEY);
                const cachedTimestamp = localStorage.getItem(CACHE_TS_KEY);

                if (cachedData && cachedTimestamp) {
                    const age = Date.now() - parseInt(cachedTimestamp, 10);
                    if (age < CACHE_DURATION) {
                        try {
                            const parsed = JSON.parse(cachedData);
                            if (parsed && (parsed.stops || parsed.routes)) {
                                setData({
                                    stops: parsed.stops || [],
                                    routes: parsed.routes || [],
                                    locations: parsed.locations || [],
                                    route_geometries: parsed.route_geometries || {}
                                });
                                setLoading(false);
                                return;
                            }
                        } catch {
                            localStorage.removeItem(CACHE_KEY);
                            localStorage.removeItem(CACHE_TS_KEY);
                        }
                    }
                }

                // 2. Load from bundled JSON files
                const result = await fetchStaticData();

                const structuredData = {
                    stops: result?.stops || [],
                    routes: result?.routes || [],
                    locations: result?.locations || [],
                    route_geometries: result?.route_geometries || {}
                };

                setData(structuredData);

                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify(structuredData));
                    localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
                } catch (e) {
                    console.warn('Failed to save to localStorage (quota exceeded?)', e);
                }

            } catch (err) {
                console.error("Failed to load static data", err);

                // Fallback: use expired cache if available
                const cachedData = localStorage.getItem(CACHE_KEY);
                if (cachedData) {
                    try {
                        const parsed = JSON.parse(cachedData);
                        setData({
                            stops: parsed.stops || [],
                            routes: parsed.routes || [],
                            locations: parsed.locations || [],
                            route_geometries: parsed.route_geometries || {}
                        });
                    } catch {
                        setData({ stops: [], routes: [], locations: [] });
                    }
                } else {
                    setData({ stops: [], routes: [], locations: [] });
                }
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // Get user's GPS location
    useEffect(() => {
        if (!('geolocation' in navigator)) return;

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                setUserLocation({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                });
            },
            (error) => {
                console.warn('Could not get location:', error.message);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    const handleRouteSelect = async (routeName, serviceId = 'WEEKDAY', showLoop = false) => {
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
            setSelectedHeadsign(null);

            const service = route.services[serviceIndex];
            if (!service) return;

            const headsigns = [...new Set(service.trips.map(t => t.headsign))];
            const geometries = headsigns.map(headsign => {
                const specificKey = `${routeName} : ${headsign}`;
                return data.route_geometries?.[specificKey] || null;
            }).filter(Boolean);

            setRouteGeometry({
                type: 'MultiLineString',
                coordinates: geometries.map(g => g.coordinates)
            });

        } else {
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

    const handleDirectionSelect = (routeName, headsign) => {
        setSelectedHeadsign(headsign);
        setRouteGeometry(null);

        const specificKey = `${routeName} : ${headsign}`;
        if (data.route_geometries?.[specificKey]) {
            setRouteGeometry(data.route_geometries[specificKey]);
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

            if (selectedHeadsign) {
                const trip = activeService.trips.find(t => t.headsign === selectedHeadsign);
                if (trip) {
                    selectedStopIds = trip.stops_sequence;
                }
            }
        }
    }

    let visibleStops = [];
    if (showAllStops) {
        visibleStops = data?.stops || [];
    } else if (selectedStopIds.length > 0) {
        visibleStops = (data?.stops || []).filter(s => selectedStopIds.includes(s.id));
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
                userLocation={userLocation}
                onSelectRoute={handleRouteSelect}
                onDirectionSelect={handleDirectionSelect}
                visibleStops={visibleStops}
                selectedStopIds={selectedStopIds}
                routeGeometry={routeGeometry}
                selectedServiceIndex={selectedServiceIndex}
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
                </div>

                <div className="sidebar-footer">
                    <span>© UTM 2026</span>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <a
                            href="https://docs.google.com/forms/d/e/1FAIpQLSd4-41iwX8i8mylExc3UMTn2rGsiKiGsbhXDGCxdtgKhrb5Kg/viewform?usp=publish-editor"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                            Feedback
                        </a>
                    </div>
                </div>
            </aside>

            {/* Map Area */}
            <main className="map-area">
                {/* Floating Controls */}
                <div className="floating-tools">
                    <button
                        className="tool-btn"
                        title="Zoom in"
                        onClick={() => window.dispatchEvent(new CustomEvent('map-zoom', { detail: { direction: 'in' } }))}
                    >
                        <span className="material-icons-round">add</span>
                    </button>
                    <button
                        className="tool-btn"
                        title="Zoom out"
                        onClick={() => window.dispatchEvent(new CustomEvent('map-zoom', { detail: { direction: 'out' } }))}
                    >
                        <span className="material-icons-round">remove</span>
                    </button>
                    <button
                        className="tool-btn"
                        title="Centre on my location"
                        onClick={() => window.dispatchEvent(new Event('map-center-user'))}
                    >
                        <span className="material-icons-round">my_location</span>
                    </button>
                </div>

                {/* Map */}
                <div style={{ height: '100%', width: '100%' }}>
                    <MapComponent
                        stops={visibleStops}
                        selectedRouteStops={selectedStopIds}
                        routeGeometry={routeGeometry}
                        routeColor={getRouteColor(selectedRouteName)}
                        walkingGeometries={[]}
                        busRouteGeometry={null}
                        busRouteSegments={[]}
                        userLocation={userLocation}
                        directionsMarkers={null}
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
