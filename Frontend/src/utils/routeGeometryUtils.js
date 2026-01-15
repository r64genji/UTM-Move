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
 * Find the closest point on a line segment to a given point
 * Returns the interpolated point and the parameter t (0-1) along the segment
 */
function closestPointOnSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        // Segment is a point
        return { x: ax, y: ay, t: 0 };
    }

    // Calculate parameter t for the projection onto the line
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;

    // Clamp t to [0, 1] to stay on the segment
    t = Math.max(0, Math.min(1, t));

    return {
        x: ax + t * dx,
        y: ay + t * dy,
        t: t
    };
}

/**
 * Find the best position on the route for a stop
 * Returns the segment index and the interpolated point
 * @param {Array} coordinates - Array of [lon, lat] coordinates (GeoJSON format)
 * @param {number} lat - Target latitude
 * @param {number} lon - Target longitude
 * @returns {Object} { segmentIndex, point: {lon, lat}, t }
 */
function findBestPositionOnRoute(coordinates, lat, lon) {
    let minDist = Infinity;
    let bestResult = null;

    for (let i = 0; i < coordinates.length - 1; i++) {
        const [ax, ay] = coordinates[i];     // lon, lat
        const [bx, by] = coordinates[i + 1]; // lon, lat

        const closest = closestPointOnSegment(lon, lat, ax, ay, bx, by);
        const dist = haversineDistance(lat, lon, closest.y, closest.x);

        if (dist < minDist) {
            minDist = dist;
            bestResult = {
                segmentIndex: i,
                point: { lon: closest.x, lat: closest.y },
                t: closest.t,
                distance: dist
            };
        }
    }

    return bestResult;
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

    // Find the best positions on the route for each stop
    const startPos = findBestPositionOnRoute(coords, startStop.lat, startStop.lon);
    const endPos = findBestPositionOnRoute(coords, endStop.lat, endStop.lon);

    if (!startPos || !endPos) {
        return null;
    }

    // Determine direction: start should come before end on the route
    let startSegIdx = startPos.segmentIndex;
    let endSegIdx = endPos.segmentIndex;
    let startT = startPos.t;
    let endT = endPos.t;
    let reversed = false;

    // If start is after end, we need to handle the reversal
    if (startSegIdx > endSegIdx || (startSegIdx === endSegIdx && startT > endT)) {
        // Route might be going the opposite direction, swap and reverse later
        [startSegIdx, endSegIdx] = [endSegIdx, startSegIdx];
        [startT, endT] = [endT, startT];
        reversed = true;
    }

    // Build the segment coordinates
    const segmentCoords = [];

    // Add the start point (interpolated on the segment)
    if (reversed) {
        segmentCoords.push([endPos.point.lon, endPos.point.lat]);
    } else {
        segmentCoords.push([startPos.point.lon, startPos.point.lat]);
    }

    // Add intermediate points (vertices between start and end segments)
    if (startSegIdx === endSegIdx) {
        // Both stops are on the same segment, just connect them directly
        // (start point already added, end point added below)
    } else {
        // Add vertices from startSegIdx+1 to endSegIdx (inclusive)
        for (let i = startSegIdx + 1; i <= endSegIdx; i++) {
            segmentCoords.push([...coords[i]]);
        }
    }

    // Add the end point (interpolated on the segment)
    if (reversed) {
        segmentCoords.push([startPos.point.lon, startPos.point.lat]);
    } else {
        segmentCoords.push([endPos.point.lon, endPos.point.lat]);
    }

    // If reversed, reverse the segment so it goes from actual start to actual end
    if (reversed) {
        segmentCoords.reverse();
    }

    // Remove duplicate consecutive points
    const uniqueCoords = segmentCoords.filter((coord, index) => {
        if (index === 0) return true;
        const prev = segmentCoords[index - 1];
        const dist = haversineDistance(coord[1], coord[0], prev[1], prev[0]);
        return dist > 1; // Filter out points within 1 meter of each other
    });

    if (uniqueCoords.length < 2) {
        // Not enough points, return a simple line between stops
        return {
            type: 'LineString',
            coordinates: [
                [startStop.lon, startStop.lat],
                [endStop.lon, endStop.lat]
            ]
        };
    }

    return {
        type: 'LineString',
        coordinates: uniqueCoords
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

