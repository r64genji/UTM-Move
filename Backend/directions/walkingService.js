/**
 * walkingService.js - Walking directions service
 * Fetches turn-by-turn walking directions from GraphHopper
 */

const axios = require('axios');

// GraphHopper Local API (self-hosted)
const GRAPHHOPPER_BASE_URL = 'http://192.168.1.119:8989';

// Walking time cache to speed up A* pathfinding
const walkingTimeCache = new Map();
const CACHE_PRECISION = 4; // Decimal places for coordinate rounding
const FALLBACK_WALK_SPEED_M_PER_MIN = 83.33; // 5 km/h fallback

/**
 * Fetch detailed walking directions with turn-by-turn instructions
 * @param {Object} origin - Origin {lat, lon}
 * @param {Object} destination - Destination {lat, lon}
 * @returns {Promise<Object|null>} Walking directions with steps
 */
async function getWalkingDirections(origin, destination) {
    if (!origin || !destination) return null;

    try {
        // Use GET request for broader compatibility with GraphHopper instances
        // API format: /route?point=lat,lon&point=lat,lon&profile=foot&...
        const params = new URLSearchParams();
        params.append('point', `${origin.lat},${origin.lon}`);
        params.append('point', `${destination.lat},${destination.lon}`);
        params.append('profile', 'foot');
        params.append('instructions', 'true');
        params.append('locale', 'en');
        params.append('points_encoded', 'true');

        const response = await axios.get(
            `${GRAPHHOPPER_BASE_URL}/route`,
            {
                params: params,
                timeout: 5000 // Short timeout to fallback quickly
            }
        );

        if (response.data?.paths?.length > 0) {
            const path = response.data.paths[0];
            const instructions = path.instructions || [];

            // Extract steps from instructions
            const steps = instructions.map(inst => ({
                instruction: inst.text,
                distance: Math.round(inst.distance), // meters
                duration: Math.ceil(inst.time / 60000), // convert ms to minutes
                type: mapSignToType(inst.sign),
                name: inst.street_name || null
            }));

            return {
                distance: Math.round(path.distance || 0),
                duration: Math.ceil((path.time || 0) / 60000), // convert ms to minutes
                steps,
                geometry: path.points // Encoded polyline
            };
        }
    } catch (error) {
        console.warn('GraphHopper walking directions failed:', error.response?.data?.message || error.message);
    }

    return null;
}

/**
 * Map GraphHopper sign codes to human-readable directions
 */
function mapSignToType(sign) {
    const signMap = {
        '-98': 'u_turn',
        '-8': 'u_turn_left',
        '-7': 'keep_left',
        '-3': 'turn_sharp_left',
        '-2': 'turn_left',
        '-1': 'turn_slight_left',
        '0': 'straight',
        '1': 'turn_slight_right',
        '2': 'turn_right',
        '3': 'turn_sharp_right',
        '4': 'destination',
        '5': 'via_point',
        '6': 'roundabout',
        '7': 'keep_right',
        '8': 'u_turn_right'
    };
    return signMap[String(sign)] || 'continue';
}

/**
 * Format walking steps into readable directions
 * @param {Array} steps - GraphHopper steps
 * @returns {Array} Formatted walking instructions
 */
function formatWalkingSteps(steps) {
    return steps.map((step, index) => {
        let icon = '🚶';

        switch (step.type) {
            case 'turn_left':
            case 'turn_sharp_left':
            case 'turn_slight_left':
                icon = '↰';
                break;
            case 'turn_right':
            case 'turn_sharp_right':
            case 'turn_slight_right':
                icon = '↱';
                break;
            case 'straight':
            case 'continue':
                icon = '↑';
                break;
            case 'u_turn':
            case 'u_turn_left':
            case 'u_turn_right':
                icon = '↩';
                break;
            case 'destination':
                icon = '📍';
                break;
            case 'keep_left':
                icon = '↖';
                break;
            case 'keep_right':
                icon = '↗';
                break;
        }

        return {
            stepNumber: index + 1,
            icon,
            instruction: step.instruction,
            distance: step.distance,
            duration: step.duration,
            type: step.type
        };
    });
}

/**
 * Generate a cache key from coordinates
 * @param {Object} origin - {lat, lon}
 * @param {Object} destination - {lat, lon}
 * @returns {string} Cache key
 */
function getCacheKey(origin, destination) {
    const round = (n) => n.toFixed(CACHE_PRECISION);
    return `${round(origin.lat)},${round(origin.lon)}->${round(destination.lat)},${round(destination.lon)}`;
}

/**
 * Get walking time in minutes between two points
 * Uses GraphHopper with caching, falls back to haversine estimate
 * @param {Object} origin - {lat, lon}
 * @param {Object} destination - {lat, lon}
 * @returns {Promise<number>} Walking time in minutes
 */
async function getWalkingTime(origin, destination) {
    if (!origin || !destination) return 0;

    const cacheKey = getCacheKey(origin, destination);

    // Check cache first
    if (walkingTimeCache.has(cacheKey)) {
        return walkingTimeCache.get(cacheKey);
    }

    try {
        const params = new URLSearchParams();
        params.append('point', `${origin.lat},${origin.lon}`);
        params.append('point', `${destination.lat},${destination.lon}`);
        params.append('profile', 'foot');
        params.append('instructions', 'false'); // Skip instructions for speed
        params.append('points_encoded', 'false');

        const response = await axios.get(
            `${GRAPHHOPPER_BASE_URL}/route`,
            {
                params: params,
                timeout: 2000 // Shorter timeout for quick estimates
            }
        );

        if (response.data?.paths?.length > 0) {
            const durationMins = Math.ceil(response.data.paths[0].time / 60000);
            walkingTimeCache.set(cacheKey, durationMins);
            return durationMins;
        }
    } catch (error) {
        // Fallback silently - don't log every cache miss
    }

    // Fallback: estimate based on haversine distance
    const { haversineDistance } = require('../utils/geo');
    const dist = haversineDistance(origin.lat, origin.lon, destination.lat, destination.lon);
    const fallbackMins = Math.ceil(dist / FALLBACK_WALK_SPEED_M_PER_MIN);
    walkingTimeCache.set(cacheKey, fallbackMins);
    return fallbackMins;
}

/**
 * Clear the walking time cache (useful for testing)
 */
function clearWalkingTimeCache() {
    walkingTimeCache.clear();
}

module.exports = {
    getWalkingDirections,
    formatWalkingSteps,
    getWalkingTime,
    clearWalkingTimeCache
};
