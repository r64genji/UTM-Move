const express = require('express');
const cors = require('cors');
const { getDirections } = require('./directions/index');
const { getScheduleData, getCampusLocations, getRouteGeometries } = require('./directions/dataLoader');
const path = require('path');
const axios = require('axios'); // Move axios require to top level

const app = express();
app.use(cors());
app.use(express.json());

// Helper to decode OSRM/Google encoded polyline
// Lifted to top level scope to be accessible by all routes
function decodePolyline(encoded) {
    if (!encoded) return [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;
    const coordinates = [];

    while (index < len) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        // Return as [lon, lat] for GeoJSON
        coordinates.push([lng * 1e-5, lat * 1e-5]);
    }
    return coordinates;
}

// Endpoint: Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});

// Endpoint: Get all static data needed by the app
app.get('/api/static-data', (req, res) => {
    try {
        const schedule = getScheduleData();
        const locations = getCampusLocations();
        const routeGeometries = getRouteGeometries();

        res.json({
            stops: schedule.stops || [],
            routes: schedule.routes || [],
            route_geometries: routeGeometries || {},
            locations: locations.locations || []
        });
    } catch (error) {
        console.error('Error fetching static data:', error);
        res.status(500).json({ error: 'Failed to load static data' });
    }
});

// Endpoint: Get next bus for a route
app.get('/api/next-bus', (req, res) => {
    try {
        const { route, time, stop } = req.query;
        if (!route) {
            return res.status(400).json({ error: 'Route parameter required' });
        }

        const schedule = getScheduleData();
        const currentTime = time || new Date().toTimeString().slice(0, 5);

        // Determine current day
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = days[new Date().getDay()];

        // Find the route
        const routeData = schedule.routes.find(r => r.name === route || r.name.includes(route));
        if (!routeData) {
            return res.json({ nextBus: null, message: 'Route not found' });
        }

        // Find active service for today
        const activeService = routeData.services.find(s => s.days.includes(today));
        if (!activeService) {
            return res.json({ nextBus: null, message: 'No service today' });
        }

        // Friday prayer break check (12:40 - 14:00)
        const isFridayPrayerBreak = today === 'friday' && currentTime >= '12:40' && currentTime < '14:00';

        // Find the next bus time
        let nextBus = null;
        for (const trip of activeService.trips) {
            if (!trip.times || trip.times.length === 0) continue;

            for (let i = 0; i < trip.times.length; i++) {
                const busTime = trip.times[i];
                if (!busTime) continue;

                // Skip if during Friday prayer break
                if (isFridayPrayerBreak || (today === 'friday' && busTime >= '12:40' && busTime < '14:00')) {
                    continue;
                }

                if (busTime >= currentTime) {
                    if (!nextBus || busTime < nextBus.time) {
                        nextBus = {
                            time: busTime,
                            route: routeData.name,
                            headsign: trip.headsign,
                            stop: trip.stops_sequence[i] || trip.stops_sequence[0]
                        };
                    }
                    break; // Found the next time for this trip, move to next trip
                }
            }
        }

        res.json({ nextBus });
    } catch (error) {
        console.error('Error getting next bus:', error);
        res.status(500).json({ error: 'Failed to get next bus' });
    }
});

// Endpoint: Get directions from origin to destination
app.get('/api/directions', async (req, res) => {
    try {
        const { originLat, originLon, originStopId, destLocationId, destLat, destLon, destName, time, day, forceBus } = req.query;

        // Validate: need either destLocationId OR destLat/destLon
        if (!destLocationId && (!destLat || !destLon)) {
            return res.status(400).json({ error: 'Please provide destLocationId or destLat/destLon' });
        }

        const currentTime = time || new Date().toTimeString().slice(0, 5);

        // Build destination object for pinned locations
        let pinnedDestination = null;
        if (destLat && destLon) {
            pinnedDestination = {
                id: destLocationId || `PINNED_${destLat}_${destLon}`,
                name: destName || `Pinned Location (${parseFloat(destLat).toFixed(4)}, ${parseFloat(destLon).toFixed(4)})`,
                lat: parseFloat(destLat),
                lon: parseFloat(destLon),
                category: 'pinned'
            };
        }

        const result = await getDirections(
            originLat ? parseFloat(originLat) : null,
            originLon ? parseFloat(originLon) : null,
            originStopId || null,
            destLocationId,
            currentTime,
            day || null,
            forceBus === 'true',
            pinnedDestination  // Pass pinned destination as additional param
        );

        res.json(result);
    } catch (error) {
        console.error('Error getting directions:', error);
        res.status(500).json({ error: 'Failed to get directions' });
    }
});

// Endpoint: Proxy route requests to GraphHopper via the backend (local instance)
const GRAPHHOPPER_BASE_URL = 'http://192.168.1.119:8989';

app.get('/api/ors-route', async (req, res) => {
    try {
        const { profile, coordinates } = req.query;
        if (!coordinates) {
            return res.status(400).json({ error: 'Missing coordinates' });
        }

        // Parse coordinates from string (format: lon,lat;lon,lat;...)
        // GraphHopper uses [lon, lat] format in POST body
        const coords = coordinates.split(';').map(pair => pair.split(',').map(Number));

        // Map profile names from ORS-style to GraphHopper-style
        const profileMap = {
            'foot-walking': 'foot',
            'driving-car': 'car',
            'cycling-regular': 'bike',
            'cycling-road': 'bike',
            'cycling-mountain': 'bike'
        };
        const activeProfile = profileMap[profile] || profile || 'foot';

        // POST to local GraphHopper instance (no API key needed)
        const response = await axios.post(
            `${GRAPHHOPPER_BASE_URL}/route`,
            {
                points: coords,
                profile: activeProfile,
                instructions: false,
                points_encoded: true
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );

        if (response.data && response.data.paths && response.data.paths.length > 0) {
            const path = response.data.paths[0];
            const decodedCoords = decodePolyline(path.points);

            return res.json({
                geometry: {
                    type: 'LineString',
                    coordinates: decodedCoords
                },
                distance: path.distance,
                duration: path.time / 1000 // Convert ms to seconds
            });
        }

        console.warn('GraphHopper returned no routes:', response.data);
        res.status(404).json({ error: 'Route not found from GraphHopper' });
    } catch (error) {
        // Enhanced error logging
        const status = error.response ? error.response.status : 500;
        const msg = error.response?.data?.message || error.message;

        if (error.response) {
            console.error(`GraphHopper Error (${status}):`, JSON.stringify(error.response.data));
        } else {
            console.error('GraphHopper Error:', error.message);
        }

        res.status(status).json({
            error: 'GraphHopper Route Fetch Failed',
            details: msg
        });
    }
});

// --- SERVE FRONTEND (Production) ---
const frontendPath = path.join(__dirname, '../Frontend/dist');

// Serve static files from the React build
app.use(express.static(frontendPath));

// Handle React Routing, return all requests to React app
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to view the app.`);
});