// routeGeometryUtils.js
// Utilities for extracting segments from bus route geometries

/**
 * Calculate Haversine distance between two coordinates in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Find the index of the nearest point on a LineString to a given coordinate
 * @param {Array} coordinates - Array of [lon, lat] coordinates (GeoJSON format)
 * @param {number} lat - Target latitude
 * @param {number} lon - Target longitude
 * @returns {number} Index of nearest point
 */
function findNearestPointIndex(coordinates, lat, lon) {
    let minDist = Infinity;
    let nearestIdx = 0;

    for (let i = 0; i < coordinates.length; i++) {
        const [coordLon, coordLat] = coordinates[i];
        const dist = haversineDistance(lat, lon, coordLat, coordLon);
        if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
        }
    }

    return nearestIdx;
}

/**
 * Extract a segment of a route geometry between two stops
 * @param {Object} routeGeometry - GeoJSON LineString geometry
 * @param {Object} startStop - { lat, lon } of the start stop
 * @param {Object} endStop - { lat, lon } of the end stop
 * @returns {Object|null} GeoJSON LineString of the segment, or null if invalid
 */
export function extractRouteSegment(routeGeometry, startStop, endStop) {
    if (!routeGeometry || !routeGeometry.coordinates || routeGeometry.coordinates.length < 2) {
        return null;
    }

    if (!startStop || !endStop) {
        return routeGeometry; // Return full route if stops not specified
    }

    const coords = routeGeometry.coordinates;

    // Find nearest points on the route to each stop
    const startIdx = findNearestPointIndex(coords, startStop.lat, startStop.lon);
    const endIdx = findNearestPointIndex(coords, endStop.lat, endStop.lon);

    // Ensure we have a valid segment (start must be before end in route direction)
    if (startIdx >= endIdx) {
        // If indices are reversed, the route might be going the other direction
        // In this case, return the segment in reverse
        console.warn('Route segment indices reversed, route may be in opposite direction');
        // Still extract the segment but in the order found
        const segmentCoords = coords.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);

        // If start is after end, reverse the segment
        if (startIdx > endIdx) {
            segmentCoords.reverse();
        }

        return {
            type: 'LineString',
            coordinates: segmentCoords
        };
    }

    // Extract the segment (inclusive of both endpoints)
    const segmentCoords = coords.slice(startIdx, endIdx + 1);

    return {
        type: 'LineString',
        coordinates: segmentCoords
    };
}

/**
 * Extract segment and ensure proper direction (from start to end)
 */
export function extractDirectedRouteSegment(routeGeometry, startStop, endStop) {
    const segment = extractRouteSegment(routeGeometry, startStop, endStop);

    if (!segment || segment.coordinates.length < 2) {
        return segment;
    }

    // Verify the segment goes from start to end by checking first/last points
    const firstCoord = segment.coordinates[0];
    const lastCoord = segment.coordinates[segment.coordinates.length - 1];

    const distStartToFirst = haversineDistance(startStop.lat, startStop.lon, firstCoord[1], firstCoord[0]);
    const distStartToLast = haversineDistance(startStop.lat, startStop.lon, lastCoord[1], lastCoord[0]);

    // If the last point is closer to start than first point, reverse the segment
    if (distStartToLast < distStartToFirst) {
        return {
            type: 'LineString',
            coordinates: [...segment.coordinates].reverse()
        };
    }

    return segment;
}
