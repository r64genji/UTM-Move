/**
 * locationService.js - Optimized stop/location lookups with LRU cache
 */

const axios = require('axios');
const { haversineDistance } = require('../utils/geo');
const { getIndexes, getScheduleData, getCampusLocations } = require('./dataLoader');

// GraphHopper Local API (self-hosted)
// Note: Matrix API requires --web.max_matrix_size config in GraphHopper
const GRAPHHOPPER_BASE_URL = 'http://192.168.1.119:8989';

// LRU Cache for nearest stops (key: "lat,lon" → stops array)
const nearestStopsCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_PRECISION = 4; // Decimal places for lat/lon rounding

function getCacheKey(lat, lon) {
    return `${lat.toFixed(CACHE_PRECISION)},${lon.toFixed(CACHE_PRECISION)}`;
}

function addToCache(key, value) {
    if (nearestStopsCache.size >= CACHE_MAX_SIZE) {
        // Remove oldest entry
        const firstKey = nearestStopsCache.keys().next().value;
        nearestStopsCache.delete(firstKey);
    }
    nearestStopsCache.set(key, value);
}

/**
 * Get stop by ID - O(1) lookup
 */
function getStopById(stopId) {
    if (!stopId) return undefined;
    return getIndexes().stopsById.get(stopId);
}

/**
 * Get location by ID with cascading fallbacks - optimized
 */
function getLocationById(locationId) {
    if (!locationId) return null;

    const indexes = getIndexes();
    const searchTerm = locationId.toLowerCase();

    // 1. Exact ID match in locations (O(1))
    let location = indexes.locationsById.get(locationId);
    if (location) return location;

    // 2. Exact ID match in stops (O(1))
    let stop = indexes.stopsById.get(locationId);
    if (stop) {
        return {
            id: stop.id,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon,
            nearestStop: stop.id,
            category: 'bus_stop'
        };
    }

    // 3. Case-insensitive name match in locations (O(1))
    location = indexes.locationsByName.get(searchTerm);
    if (location) return location;

    // 4. Case-insensitive stop name match (O(n) but rare)
    for (const [id, s] of indexes.stopsById) {
        if (s.name.toLowerCase() === searchTerm) {
            return {
                id: s.id, name: s.name, lat: s.lat, lon: s.lon,
                nearestStop: s.id, category: 'bus_stop'
            };
        }
    }

    // 5. Partial match (O(n) but very rare)
    for (const [id, s] of indexes.stopsById) {
        if (s.name.toLowerCase().includes(searchTerm) || searchTerm.includes(s.name.toLowerCase())) {
            return {
                id: s.id, name: s.name, lat: s.lat, lon: s.lon,
                nearestStop: s.id, category: 'bus_stop'
            };
        }
    }

    return null;
}

/**
 * Fetch walking distances from GraphHopper Matrix API
 */
async function getWalkingDistances(originLat, originLon, destinations) {
    if (destinations.length === 0) return [];

    // GraphHopper matrix: use from_points and to_points separately (don't mix with points)
    const fromPoints = [[originLon, originLat]];
    const toPoints = destinations.map(d => [d.lon, d.lat]);

    try {
        // POST to local GraphHopper Matrix endpoint (no API key needed)
        const response = await axios.post(
            `${GRAPHHOPPER_BASE_URL}/matrix`,
            {
                from_points: fromPoints,
                to_points: toPoints,
                profile: 'foot',
                out_arrays: ['distances']
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            }
        );

        if (response.data?.distances) {
            return response.data.distances[0];
        }
    } catch (error) {
        console.warn('GraphHopper Matrix fetch failed, using Haversine:', error.response?.data?.message || error.message);
    }

    return null;
}

/**
 * Find nearest stops with caching and GraphHopper refinement
 */
async function findNearestStops(lat, lon, count = 3) {
    const cacheKey = getCacheKey(lat, lon);

    // Check cache first
    if (nearestStopsCache.has(cacheKey)) {
        const cached = nearestStopsCache.get(cacheKey);
        return cached.slice(0, count);
    }

    const indexes = getIndexes();

    // Fast Haversine pre-filter using indexed stops array
    const candidates = [];
    for (const stop of indexes.stopsArray) {
        candidates.push({
            ...stop,
            distance: haversineDistance(lat, lon, stop.lat, stop.lon)
        });
    }

    // Sort by distance
    candidates.sort((a, b) => a.distance - b.distance);
    let bestCandidates = candidates.slice(0, 10);

    // Refine with GraphHopper walking distances
    const ghDistances = await getWalkingDistances(lat, lon, bestCandidates);

    if (ghDistances) {
        bestCandidates = bestCandidates.map((stop, i) => ({
            ...stop,
            distance: ghDistances[i] || stop.distance
        }));
        bestCandidates.sort((a, b) => a.distance - b.distance);
    }

    // Cache the result (store more than needed for future count variations)
    addToCache(cacheKey, bestCandidates.slice(0, 10));

    return bestCandidates.slice(0, count);
}

/**
 * Find nearest stops synchronously (no GraphHopper, for destination stops)
 */
function findNearestStopsSync(destLocation, count = 3) {
    const indexes = getIndexes();

    const candidates = [];
    for (const stop of indexes.stopsArray) {
        candidates.push({
            ...stop,
            dist: haversineDistance(destLocation.lat, destLocation.lon, stop.lat, stop.lon)
        });
    }

    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, count);
}

module.exports = {
    getStopById,
    getLocationById,
    getWalkingDistances,
    findNearestStops,
    findNearestStopsSync,
    GRAPHHOPPER_BASE_URL
};
