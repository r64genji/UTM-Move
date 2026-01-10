import axios from 'axios';

const OSRM_DRIVING_URL = 'http://router.project-osrm.org/route/v1/driving';

// OpenRouteService for walking (proper pedestrian paths)
const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY;
const ORS_WALKING_URL = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

// Function to fetch the route shape (polyline) connecting a list of stops (for bus routes)
export const fetchRouteGeom = async (stops) => {
    if (!stops || stops.length < 2) return null;

    // Format coordinates: lon,lat;lon,lat;...
    const coordinates = stops.map(stop => `${stop.lon},${stop.lat}`).join(';');

    try {
        // Use 'overview=full' to get detailed geometry
        // 'geometries=geojson' returns GeoJSON LineString
        const url = `${OSRM_DRIVING_URL}/${coordinates}?overview=full&geometries=geojson`;
        const response = await axios.get(url);

        if (response.data.code === 'Ok' && response.data.routes.length > 0) {
            return response.data.routes[0].geometry; // This is a GeoJSON geometry object
        }
        return null;
    } catch (error) {
        console.error('Error fetching route from OSRM:', error);
        return null;
    }
};

// Function to fetch walking route between two points using OpenRouteService
export const fetchWalkingRoute = async (origin, destination) => {
    if (!origin || !destination) return null;

    try {
        // ORS GeoJSON endpoint expects coordinates as [lon, lat] arrays
        const response = await axios.post(
            ORS_WALKING_URL,
            {
                coordinates: [
                    [origin.lon, origin.lat],
                    [destination.lon, destination.lat]
                ]
            },
            {
                headers: {
                    'Authorization': ORS_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        // ORS GeoJSON response has features array with LineString geometry
        if (response.data && response.data.features && response.data.features.length > 0) {
            const feature = response.data.features[0];
            const props = feature.properties.summary || {};
            return {
                geometry: feature.geometry,
                distance: Math.round(props.distance || 0), // meters
                duration: Math.ceil((props.duration || 0) / 60) // minutes
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching walking route from ORS:', error);
        return null;
    }
};

