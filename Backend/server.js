// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { getDirections } = require('./directions/index');
const { getScheduleData, getCampusLocations, getRouteGeometries } = require('./directions/dataLoader');
const { validateCoord, validateTime, validateDay, sanitizeString, validateReportInput } = require('./utils/validators');

const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Configuration from environment
const GRAPHHOPPER_BASE_URL = process.env.GRAPHHOPPER_URL || 'http://localhost:8989';
// CORS_ORIGIN can be comma-separated for multiple origins (e.g., "http://localhost:5173,https://your-app.vercel.app")
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000').split(',').map(o => o.trim());

const app = express();

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// 1. Security Headers (Helmet) - Protects against XSS, clickjacking, MIME sniffing
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org"],
            connectSrc: ["'self'", "https://*.tile.openstreetmap.org"]
        }
    },
    crossOriginEmbedderPolicy: false  // Allow map tiles
}));

// 2. Rate Limiting - DDoS protection
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 1000,                  // 1000 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    // Skip rate limiting for read-only data endpoints
    skip: (req) => ['/api/health', '/api/next-bus', '/api/schedule', '/api/routes', '/api/locations', '/api/static-data'].some(
        path => req.path.startsWith(path)
    )
});

// Stricter rate limit for expensive endpoints (directions, routing)
const directionsLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 30,               // 30 requests per minute (was 20)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many direction requests. Please wait.' }
});

// Apply rate limiters
app.use('/api/', apiLimiter);
app.use('/api/directions', directionsLimiter);
app.use('/api/ors-route', directionsLimiter);

// 3. CORS - Restrict to configured origins only
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (CORS_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Cache-Control', 'Authorization']
}));

// 4. Body parsing with size limits - Prevents large payload attacks
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 5. Suspicious IP tracking - Additional DDoS layer
const suspiciousIPs = new Map();
app.use((req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const count = suspiciousIPs.get(ip) || 0;

    if (count > 500) {
        return res.status(429).json({ error: 'Temporarily blocked due to excessive requests' });
    }

    suspiciousIPs.set(ip, count + 1);
    next();
});

// Clear IP counters every hour
setInterval(() => suspiciousIPs.clear(), 60 * 60 * 1000);


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

        // Find upcoming buses within 1 hour
        let nextBus = null;
        let upcoming = [];
        const ONE_HOUR_MINS = 60;

        for (const trip of activeService.trips) {
            // Check if this trip visits the requested stop
            let stopOffset = 0;
            if (stop) {
                const stopIndex = trip.stops_sequence.indexOf(stop);
                if (stopIndex === -1) continue; // Stop not in this trip

                if (trip.arrival_offsets && trip.arrival_offsets[stopIndex] !== undefined) {
                    stopOffset = trip.arrival_offsets[stopIndex];
                } else {
                    // Fallback assuming 3 mins per stop if no offsets
                    stopOffset = stopIndex * 3;
                }
            }

            if (!trip.times || trip.times.length === 0) continue;

            for (const startTime of trip.times) {
                // Skip if start time is during Friday prayer break
                if (isFridayPrayerBreak || (today === 'friday' && startTime >= '12:40' && startTime < '14:00')) {
                    continue;
                }

                // Calculate Arrival Time at the specific stop
                const [startH, startM] = startTime.split(':').map(Number);
                const totalMins = startH * 60 + startM + stopOffset;
                const arrH = Math.floor(totalMins / 60) % 24;
                const arrM = totalMins % 60;
                const arrivalTime = `${arrH}:${arrM.toString().padStart(2, '0')}`;

                // Compare with Current Time
                const [curH, curM] = currentTime.split(':').map(Number);
                const curTotal = curH * 60 + curM;
                const arrivalTotal = arrH * 60 + arrM;

                if (arrivalTotal >= curTotal) {
                    const remaining = arrivalTotal - curTotal;

                    if (remaining <= ONE_HOUR_MINS) {
                        const busInfo = {
                            time: arrivalTime,
                            remaining: remaining,
                            route: routeData.name,
                            headsign: trip.headsign,
                            stop: stop || trip.stops_sequence[0]
                        };

                        upcoming.push(busInfo);

                        // Track the very next bus for backward compatibility
                        if (!nextBus || remaining < nextBus.remaining) {
                            nextBus = busInfo;
                        }
                    }
                }
            }
        }

        // Sort upcoming buses by time
        upcoming.sort((a, b) => a.remaining - b.remaining);

        // Deduplicate
        upcoming = upcoming.filter((bus, index, self) =>
            index === self.findIndex((b) => (
                b.time === bus.time && b.route === bus.route
            ))
        );

        res.json({ nextBus, upcoming });
    } catch (error) {
        console.error('Error getting next bus:', error);
        res.status(500).json({ error: 'Failed to get next bus' });
    }
});

// Endpoint: Get directions from origin to destination
app.get('/api/directions', async (req, res) => {
    try {
        const { originLat, originLon, originStopId, destLocationId, destLat, destLon, destName, time, day, forceBus } = req.query;

        // Input Validation
        if (originLat) {
            const latCheck = validateCoord(originLat, 'originLat');
            if (!latCheck.valid) return res.status(400).json({ error: latCheck.error });
        }
        if (originLon) {
            const lonCheck = validateCoord(originLon, 'originLon');
            if (!lonCheck.valid) return res.status(400).json({ error: lonCheck.error });
        }
        if (destLat) {
            const destLatCheck = validateCoord(destLat, 'destLat');
            if (!destLatCheck.valid) return res.status(400).json({ error: destLatCheck.error });
        }
        if (destLon) {
            const destLonCheck = validateCoord(destLon, 'destLon');
            if (!destLonCheck.valid) return res.status(400).json({ error: destLonCheck.error });
        }
        if (time) {
            const timeCheck = validateTime(time);
            if (!timeCheck.valid) return res.status(400).json({ error: timeCheck.error });
        }
        if (day) {
            const dayCheck = validateDay(day);
            if (!dayCheck.valid) return res.status(400).json({ error: dayCheck.error });
        }

        // Validate: need either destLocationId OR destLat/destLon
        if (!destLocationId && (!destLat || !destLon)) {
            return res.status(400).json({ error: 'Please provide destLocationId or destLat/destLon' });
        }

        // Sanitize string inputs
        const sanitizedDestLocationId = sanitizeString(destLocationId, 100);
        const sanitizedDestName = sanitizeString(destName, 200);
        const sanitizedOriginStopId = sanitizeString(originStopId, 50);

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

// Endpoint: Proxy route requests to GraphHopper via the backend
// Uses GRAPHHOPPER_BASE_URL from environment configuration at top of file

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

// Endpoint: Submit Community Report
app.post('/api/report', apiLimiter, async (req, res) => {
    try {
        const { type, details } = req.body;

        // Security Validation (Fail Fast)
        const validation = validateReportInput(type, details);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const report = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            type,
            details: validation.sanitizedDetails, // Use sanitized version
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
        };

        const reportsDir = path.join(__dirname, 'reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir);
        }

        const reportsFile = path.join(reportsDir, 'reports.jsonl');

        fs.appendFile(reportsFile, JSON.stringify(report) + '\n', (err) => {
            if (err) {
                console.error('Failed to save report:', err);
                return res.status(500).json({ error: 'Failed to save report' });
            }
            res.status(201).json({ success: true, message: 'Report submitted successfully' });
        });

    } catch (error) {
        console.error('Report Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Middleware: Basic Authentication
const basicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Console"');
        return res.status(401).json({ error: 'Authentication required' });
    }

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];

    // Default credentials (admin:admin) - Change in .env for production!
    const validUser = process.env.ADMIN_USER || 'admin';
    const validPass = process.env.ADMIN_PASS || 'admin';

    if (user === validUser && pass === validPass) {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Console"');
        return res.status(401).json({ error: 'Invalid credentials' });
    }
};

// Endpoint: Get All Reports (Protected Admin Area)
app.get('/api/reports', apiLimiter, basicAuth, (req, res) => {
    const reportsDir = path.join(__dirname, 'reports');
    const reportsFile = path.join(reportsDir, 'reports.jsonl');

    if (!fs.existsSync(reportsFile)) {
        return res.json([]);
    }

    const reports = [];

    try {
        const fileContent = fs.readFileSync(reportsFile, 'utf-8');
        const lines = fileContent.split('\n');

        for (const line of lines) {
            if (line.trim()) {
                try {
                    reports.push(JSON.parse(line));
                } catch (e) {
                    console.error('Error parsing report line:', e);
                }
            }
        }
        // Return most recent first
        res.json(reports.reverse());
    } catch (err) {
        console.error('Error reading reports:', err);
        res.status(500).json({ error: 'Failed to read reports' });
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

const PORT = process.env.PORT || 3000;

// Create server instance
let server;
if (require.main === module) {
    // Production: Start listening
    server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Open http://localhost:${PORT} to view the app.`);
    });

    // Slowloris & connection exhaustion protection
    server.headersTimeout = 20000;    // 20s to send headers
    server.requestTimeout = 30000;    // 30s total request time
    server.keepAliveTimeout = 5000;   // 5s keep-alive
    server.maxHeadersCount = 50;      // Limit header count
} else {
    // Testing: Create server on different port for tests
    server = require('http').createServer(app);
    server.headersTimeout = 20000;
    server.requestTimeout = 30000;
    server.keepAliveTimeout = 5000;
    server.maxHeadersCount = 50;
}

// Export for testing
module.exports = { app, server };