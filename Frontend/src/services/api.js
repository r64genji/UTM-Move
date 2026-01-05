import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

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

// Fetch directions from origin to destination
export const fetchDirections = async (params) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/directions`, { params });
        return response.data;
    } catch (error) {
        console.error('Error fetching directions:', error);
        return { error: 'Failed to get directions. Please try again.' };
    }
};
