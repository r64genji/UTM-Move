const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SCHEDULE_PATH = path.join(__dirname, 'schedule.json');
const GEOMETRIES_PATH = path.join(__dirname, 'route_geometries.json');
const WAYPOINTS_PATH = path.join(__dirname, 'route_waypoints.json');

const OSRM_BASE_URL = 'http://router.project-osrm.org/route/v1/driving';

async function cacheRoutes() {
    console.log("Starting Route Caching...");

    // 1. Load Data
    const schedule = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));
    let geometries = {};
    if (fs.existsSync(GEOMETRIES_PATH)) {
        geometries = JSON.parse(fs.readFileSync(GEOMETRIES_PATH, 'utf8'));
    }
    let waypoints = {};
    if (fs.existsSync(WAYPOINTS_PATH)) {
        waypoints = JSON.parse(fs.readFileSync(WAYPOINTS_PATH, 'utf8'));
    }

    const stopsMap = new Map(schedule.stops.map(s => [s.id, s]));

    // 2. Iterate Routes
    for (const route of schedule.routes) {
        for (const service of route.services) {
            for (const trip of service.trips) {
                const headsign = trip.headsign;
                const routeName = route.name;
                const key = `${routeName} : ${headsign}`;

                // 3. Check if exists (SKIP if manual override exists)
                if (geometries[key] && geometries[key].coordinates && geometries[key].coordinates.length > 0) {
                    console.log(`[SKIP] Manual/Cached geometry exists for: ${key}`);
                    continue;
                }

                console.log(`[FETCH] Downloading geometry for: ${key}...`);

                // 4. Construct Coordinates (Inject Waypoints)
                let routeStops = [];
                trip.stops_sequence.forEach(stopId => {
                    const stop = stopsMap.get(stopId);
                    if (stop) {
                        routeStops.push(stop);

                        // Check for waypoints AFTER this stop
                        if (waypoints[key]) {
                            const specificWaypoints = waypoints[key].filter(wp => wp.afterStopId === stopId);
                            specificWaypoints.forEach(wp => {
                                routeStops.push({ lat: wp.lat, lon: wp.lon, isWaypoint: true });
                            });
                        }
                    }
                });

                if (routeStops.length < 2) {
                    console.warn(`[WARN] Not enough stops for ${key}`);
                    continue;
                }

                // 5. Fetch from OSRM
                try {
                    const coordinates = routeStops.map(s => `${s.lon},${s.lat}`).join(';');
                    const url = `${OSRM_BASE_URL}/${coordinates}?overview=full&geometries=geojson`;

                    const response = await axios.get(url);
                    if (response.data.code === 'Ok' && response.data.routes.length > 0) {
                        geometries[key] = response.data.routes[0].geometry;
                        console.log(`[SUCCESS] Cached ${key}`);
                    } else {
                        console.error(`[ERROR] OSRM returned no route for ${key}`);
                    }

                    // Polite delay to not spam OSRM
                    await new Promise(r => setTimeout(r, 1000));

                } catch (error) {
                    console.error(`[FAIL] Failed to fetch ${key}:`, error.message);
                }
            }
        }
    }

    // 6. Save back to file
    fs.writeFileSync(GEOMETRIES_PATH, JSON.stringify(geometries, null, 4));
    console.log("Done! Routes cached to route_geometries.json");
}

cacheRoutes();
