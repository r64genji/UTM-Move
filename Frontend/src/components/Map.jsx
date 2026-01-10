import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

import 'leaflet-arrowheads';

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

const MapComponent = ({
    stops,
    selectedRouteStops,
    routeGeometry,
    routeColor = '#3b82f6',     // Custom color for the explorer route
    allRouteGeometries = [],    // Array of { geometry, color, name } for all routes display
    // Directions-specific props
    walkingGeometries = [],     // Array of walking route GeoJSON geometries
    busRouteGeometry = null,    // Legacy: Single bus route geometry
    busRouteSegments = [],      // New: Array of { coordinates, color, type }
    userLocation = null,        // { lat, lon } for user GPS marker
    directionsMarkers = null    // { origin, destination, originStop, destStop }
}) => {
    // UTM Coordinates as default center
    const defaultCenter = [1.559704, 103.634727];
    const busPolylineRef = React.useRef(null);
    const segmentRefs = React.useRef({});
    const routePolylineRefs = React.useRef({});

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

    // Legacy support
    const busRoutePositions = busRouteGeometry
        ? busRouteGeometry.coordinates.map(coord => [coord[1], coord[0]])
        : [];

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
                } catch (e) {
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
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxNativeZoom={19}
                    maxZoom={22}
                    keepBuffer={20}
                    updateWhenIdle={false}
                    updateWhenZooming={true}
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
                    const isSelected = selectedRouteStops && selectedRouteStops.includes(stop.id);

                    return (
                        <Marker key={stop.id} position={[stop.lat, stop.lon]}>
                            <Popup>
                                <strong>{stop.name}</strong><br />
                                ID: {stop.id}
                            </Popup>
                        </Marker>
                    );
                })}

                {bounds && <MapUpdater bounds={bounds} />}
            </MapContainer>
        </div>
    );
};

export default MapComponent;
