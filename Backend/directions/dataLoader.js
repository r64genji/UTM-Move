/**
 * dataLoader.js - Optimized data loading with pre-computed indexes
 * Provides O(1) lookups for stops, locations, and routes
 */

const fs = require('fs');
const path = require('path');

// Singleton cache
let _cache = null;

/**
 * Build optimized indexes for fast lookups
 */
function buildIndexes(scheduleData, campusLocations) {
    // Stop ID → Stop object (O(1) lookup)
    const stopsById = new Map();
    for (const stop of scheduleData.stops) {
        stopsById.set(stop.id, stop);
    }

    // Location ID → Location object (O(1) lookup)
    const locationsById = new Map();
    const locationsByName = new Map();
    for (const loc of campusLocations.locations) {
        locationsById.set(loc.id, loc);
        locationsByName.set(loc.name.toLowerCase(), loc);
    }

    // Stop ID → Routes serving that stop (O(1) lookup)
    // Pre-compute all routes for every stop
    const routesByStop = new Map();

    for (const route of scheduleData.routes) {
        for (const service of route.services) {
            for (const trip of service.trips) {
                for (let stopIndex = 0; stopIndex < trip.stops_sequence.length; stopIndex++) {
                    const stopId = trip.stops_sequence[stopIndex];

                    if (!routesByStop.has(stopId)) {
                        routesByStop.set(stopId, []);
                    }

                    if (stopId === 'CP') {
                        // console.log(`[DataLoader] Adding route ${route.name} (${trip.headsign}) for CP at index ${stopIndex}`);
                    }

                    routesByStop.get(stopId).push({
                        routeName: route.name,
                        headsign: trip.headsign,
                        stopIndex,
                        stopsSequence: trip.stops_sequence,
                        times: trip.times,
                        serviceDays: service.days
                    });
                }
            }
        }
    }

    // Trip key → Route duration data (O(1) lookup)
    // Build Set<stopId> for each trip for O(1) contains check
    const tripStopSets = new Map();
    for (const route of scheduleData.routes) {
        for (const service of route.services) {
            for (const trip of service.trips) {
                const key = `${route.name}:${trip.headsign}`;
                tripStopSets.set(key, new Set(trip.stops_sequence));
            }
        }
    }

    // Pre-group trips by route name for loop detection
    const tripsByRoute = new Map();
    for (const route of scheduleData.routes) {
        if (!tripsByRoute.has(route.name)) {
            tripsByRoute.set(route.name, []);
        }
        for (const service of route.services) {
            for (const trip of service.trips) {
                tripsByRoute.get(route.name).push({
                    routeName: route.name,
                    headsign: trip.headsign,
                    stopsSequence: trip.stops_sequence,
                    times: trip.times,
                    serviceDays: service.days,
                    stopsSet: new Set(trip.stops_sequence)
                });
            }
        }
    }

    return {
        stopsById,
        locationsById,
        locationsByName,
        routesByStop,
        tripStopSets,
        tripsByRoute,
        stopsArray: scheduleData.stops,
        routesArray: scheduleData.routes,
        locationsArray: campusLocations.locations
    };
}

/**
 * Load all data and build indexes
 */
function loadData() {
    if (_cache) return _cache;

    const scheduleData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'data', 'schedule.json'), 'utf8')
    );

    const campusLocations = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'data', 'campus_locations.json'), 'utf8')
    );

    const routeGeometries = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'data', 'route_geometries.json'), 'utf8')
    );

    let routeDurations = {};
    const durationsPath = path.join(__dirname, '..', 'data', 'route_durations.json');
    try {
        if (fs.existsSync(durationsPath)) {
            routeDurations = JSON.parse(fs.readFileSync(durationsPath, 'utf8'));
        }
    } catch (e) {
        console.warn('Could not load route_durations.json:', e.message);
    }

    // Build optimized indexes
    const indexes = buildIndexes(scheduleData, campusLocations);

    _cache = {
        scheduleData,
        campusLocations,
        routeGeometries,
        routeDurations,
        indexes
    };

    console.log(`[DataLoader] Loaded: ${indexes.stopsById.size} stops, ${indexes.locationsById.size} locations, ${indexes.routesByStop.size} stop-routes indexed`);

    return _cache;
}

// Accessor functions
function getScheduleData() { return loadData().scheduleData; }
function getCampusLocations() { return loadData().campusLocations; }
function getRouteGeometries() { return loadData().routeGeometries; }
function getRouteDurations() { return loadData().routeDurations; }
function getIndexes() { return loadData().indexes; }

function clearCache() { _cache = null; }

module.exports = {
    loadData,
    getScheduleData,
    getCampusLocations,
    getRouteGeometries,
    getRouteDurations,
    getIndexes,
    clearCache
};
