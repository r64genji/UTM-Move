import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const fetchStaticData = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL}/static-data`);
        return response.data;
    } catch (error) {
        console.error('Error fetching static data:', error);
        throw error;
    }
};

export const fetchNextBus = async (route, time, stop) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/next-bus`, {
            params: { route, time, stop }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching next bus:', error);
        return null; // Handle smoothly
    }
};

// Proxy ORS route requests via backend to avoid CORS and ORS config issues in frontend
export const fetchRouteFromBackend = async (coordinates, profile = 'foot-walking') => {
    try {
        // Convert coords to string format: lon,lat;lon,lat
        const coordStr = coordinates.map(c => `${c[0]},${c[1]}`).join(';');

        const response = await axios.get(`${API_BASE_URL}/ors-route`, {
            params: {
                profile,
                coordinates: coordStr
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching ORS route via backend:', error);
        return null;
    }
};

export const fetchDirections = async (params) => {
    try {
        // Add cache-busting timestamp to prevent stale responses
        const response = await axios.get(`${API_BASE_URL}/directions`, {
            params: { ...params, _t: Date.now() },
            headers: { 'Cache-Control': 'no-cache' }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching directions:', error);
        return { error: 'Failed to get directions. Please try again.' };
    }
};
