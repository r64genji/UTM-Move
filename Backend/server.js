// server.js
const express = require('express');
const cors = require('cors');
const { getNextBus } = require('./scheduleLogic'); // Import your new logic

const app = express();
app.use(cors()); // Allow requests from other apps
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Root Endpoint check
app.get('/', (req, res) => {
    res.send('UTM Move Backend is running. API available at /api/static-data');
});

// --- API ROUTES ---

// Endpoint: Get the next bus time
// Usage: GET /api/next-bus?route=route-A&time=08:15&stop=Kolej 9
app.get('/api/next-bus', async (req, res) => {
    const routeId = req.query.route;
    const userTime = req.query.time;
    const stopName = req.query.stop; // Optional

    if (!routeId || !userTime) {
        return res.status(400).json({ error: 'Please provide route and time' });
    }

    try {
        // NOTICE: We added the word 'await' here
        // The server pauses here until the database answers
        const result = await getNextBus(routeId, userTime, stopName);

        if (!result) {
            return res.json({ message: 'No more buses found for today.' });
        }

        res.json({
            query_route: routeId,
            found_route: result.route,
            next_bus_time: result.time,
            at_stop: result.stop
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});


// Endpoint: Get all static data (stops, routes, schedules) for the map
app.get('/api/static-data', (req, res) => {
    try {
        const schedulePath = require('path').join(__dirname, 'schedule.json');
        const scheduleData = JSON.parse(require('fs').readFileSync(schedulePath, 'utf8'));

        const geometriesPath = require('path').join(__dirname, 'route_geometries.json');
        let geometriesData = {};
        try {
            geometriesData = JSON.parse(require('fs').readFileSync(geometriesPath, 'utf8'));
        } catch (e) {
            console.warn("Could not load route_geometries.json", e);
        }

        const waypointsPath = require('path').join(__dirname, 'route_waypoints.json');
        let waypointsData = {};
        try {
            waypointsData = JSON.parse(require('fs').readFileSync(waypointsPath, 'utf8'));
        } catch (e) {
            console.warn("Could not load route_waypoints.json", e);
        }

        res.json({
            ...scheduleData,
            route_geometries: geometriesData,
            route_waypoints: waypointsData
        });
    } catch (error) {
        console.error('Error loading static data:', error);
        res.status(500).json({ error: 'Failed to load static data' });
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});