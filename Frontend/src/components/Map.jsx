import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
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

// Helper to update map view bounds
function MapUpdater({ bounds }) {
    const map = useMap();
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [bounds, map]);
    return null;
}

import 'leaflet-arrowheads';

// ... (existing helper)

const MapComponent = ({ stops, selectedRouteStops, routeGeometry }) => {
    // UTM Coordinates as default center
    const defaultCenter = [1.559704, 103.634727];
    const polylineRef = React.useRef(null);

    // Convert GeoJSON LineString (lon, lat) to Leaflet (lat, lon)
    const polylinePositions = routeGeometry
        ? routeGeometry.coordinates.map(coord => [coord[1], coord[0]])
        : [];

    // Apply arrowheads when polyline updates
    React.useEffect(() => {
        if (polylineRef.current) {
            const polyline = polylineRef.current;
            // Clear existing arrowheads if any? (leaflet-arrowheads usually handles update or we might need to re-add)
            // It safely adds.
            try {
                polyline.arrowheads({
                    yawn: 60,
                    size: '15px',
                    frequency: '50px',
                    fill: true
                });
            } catch (e) {
                console.warn("Failed to add arrowheads", e);
            }
        }
    }, [routeGeometry]); // Re-run when geometry changes

    // Calculate bounds if we have a route
    let bounds = null;
    if (polylinePositions.length > 0) {
        bounds = L.latLngBounds(polylinePositions);
    } else if (stops.length > 0) {
        // Default to bounds of all stops if no route selected? Or just center.
        // Let's just keep default center if no route.
    }

    return (
        <div style={{ height: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <MapContainer center={defaultCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Draw Route Polyline */}
                {polylinePositions.length > 0 && (
                    <Polyline
                        ref={polylineRef}
                        positions={polylinePositions}
                        pathOptions={{ color: 'blue', weight: 5, opacity: 0.7 }}
                    />
                )}

                {/* Draw Stops */}
                {stops.map(stop => {
                    const isSelected = selectedRouteStops && selectedRouteStops.includes(stop.id);
                    // Show all stops, maybe highlight selected ones?
                    // For now, standard marker.

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
