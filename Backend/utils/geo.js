/**
 * Shared geographic utility functions for UTM Move backend
 * Centralizes distance calculations used across directionLogic.js and enrich_schedule_logic.js
 */

/**
 * Calculate the distance between two coordinates using the Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculate the total path distance from an array of coordinates
 * @param {Array} coords - Array of [lon, lat] coordinate pairs (GeoJSON format)
 * @returns {number} Total distance in meters
 */
function getPathDistance(coords) {
    let dist = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        // GeoJSON is [lon, lat]
        dist += haversineDistance(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
    }
    return dist;
}

module.exports = {
    haversineDistance,
    getPathDistance
};
