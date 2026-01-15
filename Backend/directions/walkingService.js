/**
 * walkingService.js - Walking directions service
 * Fetches turn-by-turn walking directions from GraphHopper
 */

const axios = require('axios');

// GraphHopper Local API (self-hosted)
const GRAPHHOPPER_BASE_URL = 'http://192.168.1.119:8989';

/**
 * Fetch detailed walking directions with turn-by-turn instructions
 * @param {Object} origin - Origin {lat, lon}
 * @param {Object} destination - Destination {lat, lon}
 * @returns {Promise<Object|null>} Walking directions with steps
 */
async function getWalkingDirections(origin, destination) {
    if (!origin || !destination) return null;

    try {
        // POST request with points in [longitude, latitude] order per GraphHopper docs
        const response = await axios.post(
            `${GRAPHHOPPER_BASE_URL}/route`,
            {
                points: [
                    [origin.lon, origin.lat],
                    [destination.lon, destination.lat]
                ],
                profile: 'foot',
                instructions: true,
                locale: 'en',
                points_encoded: true
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
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

module.exports = {
    getWalkingDirections,
    formatWalkingSteps
};
