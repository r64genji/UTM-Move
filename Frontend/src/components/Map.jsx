import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getRouteColor } from '../constants';

// Fix for default marker icon in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom icons for directions
const userIcon = L.divIcon({
    className: 'user-marker',
    html: '<div style="background: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

const destinationIcon = L.divIcon({
    className: 'destination-marker',
    html: '<div style="background: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;">📍</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
});

// Custom icon for pinned origin location
const pinnedOriginIcon = L.divIcon({
    className: 'pinned-origin-marker',
    html: '<div style="background: #3b82f6; width: 24px; height: 24px; border-radius: 50%; border: 4px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

// Custom icon for pinned destination location
const pinnedDestinationIcon = L.divIcon({
    className: 'pinned-destination-marker',
    html: '<div style="background: #ef4444; width: 24px; height: 24px; border-radius: 50%; border: 4px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

// Custom icon for bus stops
const busStopIcon = L.divIcon({
    className: 'bus-stop-marker',
    html: '<div style="background: #3b82f6; width: 26px; height: 26px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white;"><span class="material-symbols-outlined" style="font-size: 16px;">directions_bus</span></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
});

import 'leaflet-arrowheads';

// Helper component to handle map click events for pinning locations
function MapClickHandler({ pinMode, onMapClick }) {
    useMapEvents({
        click: (e) => {
            if (pinMode && onMapClick) {
                onMapClick(e.latlng.lat, e.latlng.lng, pinMode);
            }
        }
    });
    return null;
}

// Helper to update map view bounds - prevents "fighting" the user's drag/zoom
function MapUpdater({ bounds }) {
    const map = useMap();
    const lastBoundsStr = React.useRef("");

    useEffect(() => {
        if (!bounds) return;

        const boundsStr = bounds.toBBoxString();
        // Only fit bounds if they have actually changed (e.g. new route selected)
        // This prevents snapping the map back while the user is actively dragging/zooming
        if (boundsStr !== lastBoundsStr.current) {
            lastBoundsStr.current = boundsStr;
            map.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 16,
                animate: true,
                duration: 0.5
            });
        }
    }, [bounds, map]);
    return null;
}

// Helper to handle external zoom/center control events
function MapControlHandler({ userLocation }) {
    const map = useMap();

    useEffect(() => {
        const handleZoom = (e) => {
            if (e.detail.direction === 'in') {
                map.zoomIn();
            } else if (e.detail.direction === 'out') {
                map.zoomOut();
            }
        };

        const handleCenterUser = () => {
            if (userLocation) {
                map.flyTo([userLocation.lat, userLocation.lon || userLocation.lng], 17, {
                    animate: true,
                    duration: 0.5
                });
            }
        };

        window.addEventListener('map-zoom', handleZoom);
        window.addEventListener('map-center-user', handleCenterUser);

        return () => {
            window.removeEventListener('map-zoom', handleZoom);
            window.removeEventListener('map-center-user', handleCenterUser);
        };
    }, [map, userLocation]);

    return null;
}

// Helper to handle window resize
function MapResizeHandler() {
    const map = useMap();
    useEffect(() => {
        let timeoutId;
        const handleResize = () => {
            if (map && map.getContainer()) {
                map.invalidateSize();
            }
        };
        window.addEventListener('resize', handleResize);
        // Initial invalidate to ensure correct size on mount
        timeoutId = setTimeout(() => {
            if (map && map.getContainer()) {
                map.invalidateSize();
            }
        }, 100);
        return () => {
            window.removeEventListener('resize', handleResize);
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [map]);
    return null;
}

const MapComponent = ({
    stops,
    routes = [],                // All routes data for computing which routes serve each stop
    routeGeometry,
    routeColor = '#3b82f6',     // Custom color for the explorer route
    allRouteGeometries = [],    // Array of { geometry, color, name } for all routes display
    // Directions-specific props
    walkingGeometries = [],     // Array of walking route GeoJSON geometries
    busRouteGeometry = null,    // Legacy: Single bus route geometry
    busRouteSegments = [],      // New: Array of { coordinates, color, type }
    userLocation = null,        // { lat, lon } for user GPS marker
    directionsMarkers = null,   // { origin, destination, originStop, destStop }
    // Pin location props
    onMapClick = null,          // Callback: (lat, lon, type) => void
    pinnedLocation = null,      // { lat, lon, type: 'origin' | 'destination' }
    pinMode = null,             // 'origin' | 'destination' | null
    onSelectRoute = null,        // Callback: (route) => void - for selecting route from stop popup
    // Arrival info props (for route detail page)
    showArrivalInfo = false,     // Whether to show next arrival time in popup
    selectedRouteName = null,    // Currently selected route name for ETA
    selectedHeadsign = null      // Currently selected headsign for ETA
}) => {
    // UTM Coordinates as default center
    const defaultCenter = [1.559704, 103.634727];
    const busPolylineRef = React.useRef(null);
    const segmentRefs = React.useRef({});
    const routePolylineRefs = React.useRef({});

    // Helper: Get routes that serve a specific stop
    const getRoutesForStop = React.useCallback((stopId) => {
        if (!routes || routes.length === 0) return [];
        const targetId = String(stopId);
        return routes.filter(route =>
            route.services?.some(service =>
                service.trips?.some(trip =>
                    trip.stops_sequence?.some(id => String(id) === targetId)
                )
            )
        );
    }, [routes]);

    // Helper: Get next arrival time for a route at a specific stop
    const getNextArrival = React.useCallback((stopId, routeName, headsign) => {
        if (!routes || !routeName) return null;

        const now = new Date();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = days[now.getDay()];
        const currentMins = now.getHours() * 60 + now.getMinutes();

        // For Route E, check all variants (E(JA), E(CP), E(N24))
        const routesToCheck = routeName === 'Route E'
            ? routes.filter(r => r.name.startsWith('Route E'))
            : [routes.find(r => r.name === routeName)].filter(Boolean);

        if (routesToCheck.length === 0) return null;

        let earliestArrival = null;

        for (const route of routesToCheck) {
            // Find active service for today
            const service = route.services?.find(s => s.days?.includes(today));
            if (!service) continue;

            // Find trips - if headsign specified, filter to that headsign
            const tripsToCheck = headsign
                ? service.trips?.filter(t => t.headsign === headsign)
                : service.trips || [];

            for (const trip of tripsToCheck) {
                // Find stop index in the sequence
                const stopIndex = trip.stops_sequence?.findIndex(id => String(id) === String(stopId));
                if (stopIndex === -1 || stopIndex === undefined) continue;

                // Calculate arrival offset for this stop
                const arrivalOffset = trip.arrival_offsets?.[stopIndex] || (stopIndex * 3);

                // Find next departure time
                for (const departTime of trip.times || []) {
                    const [h, m] = departTime.split(':').map(Number);
                    const departMins = h * 60 + m;
                    const arrivalMins = departMins + arrivalOffset;

                    // Skip Friday prayer break (12:40 - 14:00)
                    if (today === 'friday' && arrivalMins >= 760 && arrivalMins < 840) continue;

                    if (arrivalMins >= currentMins) {
                        if (!earliestArrival || arrivalMins < earliestArrival.arrivalMins) {
                            const arrivalH = Math.floor(arrivalMins / 60) % 24;
                            const arrivalM = arrivalMins % 60;
                            earliestArrival = {
                                time: `${String(arrivalH).padStart(2, '0')}:${String(arrivalM).padStart(2, '0')}`,
                                minsUntil: arrivalMins - currentMins,
                                arrivalMins
                            };
                        }
                        break; // Found next for this trip, check other routes
                    }
                }
            }
        }

        return earliestArrival;
    }, [routes]);

    // Convert GeoJSON LineString (lon, lat) to Leaflet (lat, lon)
    const polylinePositions = React.useMemo(() => {
        if (!routeGeometry) return [];
        if (routeGeometry.type === 'LineString') {
            return [routeGeometry.coordinates.map(coord => [coord[1], coord[0]])];
        } else if (routeGeometry.type === 'MultiLineString') {
            return routeGeometry.coordinates.map(line => line.map(coord => [coord[1], coord[0]]));
        }
        return [];
    }, [routeGeometry]);

    // Legacy support — memoized to avoid destabilizing the bounds useMemo on every render
    const busRoutePositions = React.useMemo(() =>
        busRouteGeometry
            ? busRouteGeometry.coordinates.map(coord => [coord[1], coord[0]])
            : []
        , [busRouteGeometry]);

    // Process separate segments
    const busSegments = busRouteSegments.map((seg, idx) => ({
        id: idx,
        positions: seg.coordinates.map(coord => [coord[1], coord[0]]),
        color: seg.color || '#3b82f6',
        dashArray: seg.type === 'walk' ? '10, 10' : null
    }));

    // Convert walking geometries
    const walkingRoutes = walkingGeometries.map(geom =>
        geom ? geom.coordinates.map(coord => [coord[1], coord[0]]) : []
    ).filter(route => route.length > 0);

    // Apply arrowheads when polyline updates
    React.useEffect(() => {
        const applyArrowheads = (ref) => {
            if (ref.current) {
                try {
                    ref.current.arrowheads({
                        yawn: 60,
                        size: '15px',
                        frequency: '50px',
                        fill: true
                    });
                } catch {
                    // console.warn("Failed to add arrowheads", e);
                }
            }
        };

        applyArrowheads(busPolylineRef);

        // Apply to all route polyline segments
        Object.values(routePolylineRefs.current).forEach(ref => {
            if (ref) applyArrowheads({ current: ref });
        });

        // Apply to all new segments
        Object.values(segmentRefs.current).forEach(ref => {
            if (ref) applyArrowheads({ current: ref });
        });

    }, [routeGeometry, busRouteGeometry, busRouteSegments]);

    // Calculate bounds with coordinate sanitization
    const bounds = React.useMemo(() => {
        const allPositions = [
            ...polylinePositions.flat(),
            ...busRoutePositions,
            ...walkingRoutes.flat(),
            ...busSegments.flatMap(s => s.positions)
        ].filter(pos => pos && pos[0] !== 0 && pos[1] !== 0 && !isNaN(pos[0]) && !isNaN(pos[1]));

        if (allPositions.length > 0) {
            return L.latLngBounds(allPositions);
        } else if (stops.length > 0) {
            const validStopCoords = stops
                .map(s => [s.lat, s.lon])
                .filter(pos => pos[0] !== 0 && pos[1] !== 0 && !isNaN(pos[0]) && !isNaN(pos[1]));

            if (validStopCoords.length > 0) {
                return L.latLngBounds(validStopCoords);
            }
        }
        return null;
    }, [polylinePositions, busRoutePositions, walkingRoutes, busSegments, stops]);

    return (
        <div style={{ height: '100%', width: '100%', position: 'relative', zIndex: 0 }}>
            <MapContainer
                center={defaultCenter}
                zoom={15}
                maxZoom={22}
                minZoom={3}
                style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
                zoomControl={false}
                renderer={L.svg({ padding: 1.5 })}
            >
                <MapResizeHandler />
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxNativeZoom={19}
                    maxZoom={22}
                    keepBuffer={4}
                    updateWhenIdle={false}
                    updateWhenZooming={false}
                />

                {/* Draw Route Polyline (route explorer mode) */}
                {polylinePositions.map((positions, idx) => (
                    <Polyline
                        key={`route-${idx}`}
                        ref={el => routePolylineRefs.current[idx] = el}
                        positions={positions}
                        pathOptions={{ color: routeColor, weight: 5, opacity: 0.7 }}
                    />
                ))}

                {/* Draw All Routes (when All Routes mode is selected) */}
                {allRouteGeometries.map((routeData, idx) => {
                    if (!routeData.geometry || !routeData.geometry.coordinates) return null;
                    const positions = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                    return (
                        <Polyline
                            key={`all-route-${idx}`}
                            positions={positions}
                            pathOptions={{ color: routeData.color, weight: 4, opacity: 0.6 }}
                        />
                    );
                })}

                {/* Draw Walking Routes (directions mode) - Green dashed */}
                {walkingRoutes.map((route, index) => (
                    <Polyline
                        key={`walk-${index}`}
                        positions={route}
                        pathOptions={{
                            color: '#22c55e',
                            weight: 4,
                            opacity: 0.8,
                            dashArray: '10, 10'
                        }}
                    />
                ))}

                {/* Draw Legacy Bus Route */}
                {busRoutePositions.length > 0 && (
                    <Polyline
                        ref={busPolylineRef}
                        positions={busRoutePositions}
                        pathOptions={{ color: routeColor, weight: 5, opacity: 0.8 }}
                    />
                )}

                {/* Draw Multi-Colored Bus Segments */}
                {busSegments.map((seg) => (
                    <Polyline
                        key={`bus-seg-${seg.id}`}
                        ref={el => segmentRefs.current[seg.id] = el}
                        positions={seg.positions}
                        pathOptions={{
                            color: seg.color,
                            weight: 5,
                            opacity: 0.8,
                            dashArray: seg.dashArray
                        }}
                    />
                ))}

                {/* User Location Marker */}
                {userLocation && (
                    <Marker position={[userLocation.lat, userLocation.lon]} icon={userIcon}>
                        <Popup>📍 Your Location</Popup>
                    </Marker>
                )}

                {/* Directions Markers */}
                {directionsMarkers && (
                    <>
                        {directionsMarkers.originStop && (
                            <CircleMarker
                                center={[directionsMarkers.originStop.lat, directionsMarkers.originStop.lon]}
                                radius={8}
                                pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1 }}
                            >
                                <Popup>🚏 Board here: {directionsMarkers.originStop.name}</Popup>
                            </CircleMarker>
                        )}
                        {directionsMarkers.destStop && (
                            <CircleMarker
                                center={[directionsMarkers.destStop.lat, directionsMarkers.destStop.lon]}
                                radius={8}
                                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }}
                            >
                                <Popup>🚏 Alight here: {directionsMarkers.destStop.name}</Popup>
                            </CircleMarker>
                        )}
                        {directionsMarkers.destination && (
                            <Marker
                                position={[directionsMarkers.destination.lat, directionsMarkers.destination.lon]}
                                icon={destinationIcon}
                            >
                                <Popup>📍 {directionsMarkers.destination.name}</Popup>
                            </Marker>
                        )}
                    </>
                )}

                {/* Draw Stops */}
                {stops.map(stop => {
                    const stopRoutes = getRoutesForStop(stop.id);

                    return (
                        <Marker
                            key={stop.id}
                            position={[stop.lat, stop.lon]}
                            icon={busStopIcon}
                            zIndexOffset={100}
                        >
                            <Popup autoPan={false} closeButton={true} className="custom-popup">
                                <div className="font-display" style={{
                                    backgroundColor: '#1a2633',
                                    color: '#e5e7eb',
                                    padding: '8px 4px',
                                    borderRadius: '8px',
                                    minWidth: '160px'
                                }}>
                                    <h3 style={{
                                        margin: '0 0 8px 0',
                                        fontSize: '14px',
                                        fontWeight: '700',
                                        color: '#ffffff',
                                        lineHeight: '1.2'
                                    }}>
                                        {stop.name}
                                    </h3>

                                    {/* Next Arrival (only when showArrivalInfo is enabled) */}
                                    {showArrivalInfo && selectedRouteName && (() => {
                                        const arrival = getNextArrival(stop.id, selectedRouteName, selectedHeadsign);
                                        if (!arrival) return null;
                                        return (
                                            <div style={{
                                                marginBottom: '8px',
                                                padding: '6px 8px',
                                                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                                borderRadius: '6px',
                                                border: '1px solid rgba(34, 197, 94, 0.3)'
                                            }}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    <span style={{
                                                        backgroundColor: getRouteColor(selectedRouteName),
                                                        color: '#fff',
                                                        fontWeight: '700',
                                                        fontSize: '11px',
                                                        padding: '2px 8px',
                                                        borderRadius: '9999px',
                                                        minWidth: '20px',
                                                        textAlign: 'center'
                                                    }}>
                                                        {selectedRouteName.replace('Route ', '')}
                                                    </span>
                                                    <span style={{
                                                        color: '#22c55e',
                                                        fontWeight: '700',
                                                        fontSize: '13px'
                                                    }}>
                                                        {arrival.minsUntil <= 1 ? 'Arriving now' : `${arrival.minsUntil} min`}
                                                    </span>
                                                    <span style={{
                                                        color: '#9ca3af',
                                                        fontSize: '11px',
                                                        marginLeft: 'auto'
                                                    }}>
                                                        @ {arrival.time}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Transfers / Other Routes */}
                                    {(() => {
                                        const transferRoutes = showArrivalInfo && selectedRouteName
                                            ? stopRoutes.filter(r => r.name !== selectedRouteName)
                                            : stopRoutes;
                                        const label = showArrivalInfo && selectedRouteName ? 'TRANSFERS:' : 'BUSES:';

                                        // Consolidate Route E variants into single "E" entry
                                        const consolidatedRoutes = [];
                                        const seenBaseRoutes = new Set();

                                        transferRoutes.forEach(route => {
                                            // Extract base route name (e.g., "Route E" from "Route E(JA)")
                                            const baseName = route.name.replace(/\([^)]+\)/g, '').trim();

                                            if (!seenBaseRoutes.has(baseName)) {
                                                seenBaseRoutes.add(baseName);
                                                consolidatedRoutes.push({
                                                    ...route,
                                                    displayName: baseName,
                                                    originalName: route.name
                                                });
                                            }
                                        });

                                        return (
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'baseline',
                                                gap: '6px',
                                                fontSize: '12px'
                                            }}>
                                                <span style={{
                                                    color: '#9ca3af',
                                                    fontWeight: '500',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em',
                                                    fontSize: '10px'
                                                }}>
                                                    {label}
                                                </span>
                                                {consolidatedRoutes.length > 0 ? (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {consolidatedRoutes.map(route => {
                                                            const routeNameShort = route.displayName.replace('Route ', '');
                                                            return (
                                                                <span
                                                                    key={route.displayName}
                                                                    onClick={() => onSelectRoute && onSelectRoute(route)}
                                                                    style={{
                                                                        backgroundColor: 'rgba(30, 64, 175, 0.3)',
                                                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                                                        color: getRouteColor(route.displayName),
                                                                        fontWeight: '700',
                                                                        cursor: 'pointer',
                                                                        padding: '2px 10px',
                                                                        borderRadius: '9999px',
                                                                        fontSize: '11px',
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    {routeNameShort}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: '#6b7280', fontStyle: 'italic' }}>None</span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

                {bounds && <MapUpdater bounds={bounds} />}

                {/* External zoom/center control handler */}
                <MapControlHandler userLocation={userLocation} />

                {/* Map Click Handler for Pin Mode */}
                <MapClickHandler pinMode={pinMode} onMapClick={onMapClick} />

                {/* Pinned Location Marker */}
                {pinnedLocation && (
                    <Marker
                        position={[pinnedLocation.lat, pinnedLocation.lon]}
                        icon={pinnedLocation.type === 'origin' ? pinnedOriginIcon : pinnedDestinationIcon}
                    >
                        <Popup>
                            📍 {pinnedLocation.type === 'origin' ? 'Start' : 'Destination'}: Pinned Location
                            <br />
                            <span style={{ fontSize: '11px', color: '#666' }}>
                                {pinnedLocation.lat.toFixed(6)}, {pinnedLocation.lon.toFixed(6)}
                            </span>
                        </Popup>
                    </Marker>
                )}
            </MapContainer>
        </div>
    );
};

export default MapComponent;
