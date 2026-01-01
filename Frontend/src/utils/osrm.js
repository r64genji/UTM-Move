import axios from 'axios';

const OSRM_BASE_URL = 'http://router.project-osrm.org/route/v1/driving';

// Function to fetch the route shape (polyline) connecting a list of stops
export const fetchRouteGeom = async (stops) => {
    if (!stops || stops.length < 2) return null;

    // Format coordinates: lon,lat;lon,lat;...
    const coordinates = stops.map(stop => `${stop.lon},${stop.lat}`).join(';');

    try {
        // Use 'overview=full' to get detailed geometry
        // 'geometries=geojson' returns GeoJSON LineString
        const url = `${OSRM_BASE_URL}/${coordinates}?overview=full&geometries=geojson`;
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
