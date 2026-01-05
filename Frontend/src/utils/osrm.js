import axios from 'axios';

const OSRM_DRIVING_URL = 'http://router.project-osrm.org/route/v1/driving';
const OSRM_WALKING_URL = 'http://router.project-osrm.org/route/v1/foot';

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

// Function to fetch walking route between two points
export const fetchWalkingRoute = async (origin, destination) => {
    if (!origin || !destination) return null;

    const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;

    try {
        const url = `${OSRM_WALKING_URL}/${coordinates}?overview=full&geometries=geojson`;
        const response = await axios.get(url);

        if (response.data.code === 'Ok' && response.data.routes.length > 0) {
            const route = response.data.routes[0];
            return {
                geometry: route.geometry,
                distance: Math.round(route.distance), // meters
                duration: Math.ceil(route.duration / 60) // minutes
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching walking route from OSRM:', error);
        return null;
    }
};
