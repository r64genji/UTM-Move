/**
 * routeScorer.js - Route cost calculation and ranking
 * Scores routes by total time (walk + wait + ride) and selects the best option
 */

const { haversineDistance } = require('../utils/geo');
const { getDynamicOffset, getNextDeparture, findNextAvailableBusForRoute, timeToMinutes } = require('./scheduler');

// Constants for route evaluation
const WALKING_SPEED_MPS = 1.4; // meters per second (~5 km/h)
const WALK_ONLY_THRESHOLD_M = 500; // Suggest walking under 500m
const PREFER_WALK_THRESHOLD_M = 1000; // Compare walk vs bus under 1km

/**
 * Calculate walking duration in minutes
 * @param {number} distanceM - Distance in meters
 * @returns {number} Walking time in minutes
 */
function getWalkingMinutes(distanceM) {
    return Math.ceil(distanceM / WALKING_SPEED_MPS / 60);
}

/**
 * Calculate bus travel duration for a route
 * @param {Object} route - Route object
 * @returns {number} Bus travel time in minutes
 */
function getBusTravelMinutes(route) {
    if (route.isLoop) {
        const originTrip = route.originTrip;
        const destTrip = route.destTrip;

        const originOff = getDynamicOffset(route.routeName, originTrip.headsign, route.originStopIndex) || 0;
        const trip1EndOff = getDynamicOffset(route.routeName, originTrip.headsign, originTrip.stopsSequence.length - 1) || 0;
        const destOff = getDynamicOffset(route.routeName, destTrip.headsign, route.destStopIndex) || 0;

        // Duration = (end of trip 1 - origin) + (dest on trip 2)
        let busMins = (trip1EndOff - originOff) + destOff;
        busMins += 5; // Buffer for trip turnaround
        return Math.max(0, busMins);
    } else {
        const originOffset = getDynamicOffset(route.routeName, route.headsign, route.originStopIndex) || 0;
        const destOffset = getDynamicOffset(route.routeName, route.headsign, route.destStopIndex) || 0;
        return Math.max(0, destOffset - originOffset);
    }
}

/**
 * Score a route candidate (lower is better)
 * @param {Object} route - Route object
 * @param {Object} departure - Departure info with minutesUntil
 * @param {Object} destStop - Destination stop object
 * @param {Object} destLocation - Final destination location
 * @returns {Object} Score details
 */
function scoreRoute(route, departure, destStop, destLocation) {
    const waitMins = departure.minutesUntil || 0;
    const busMins = getBusTravelMinutes(route);
    const walkFromDist = haversineDistance(
        destStop.lat, destStop.lon,
        destLocation.lat, destLocation.lon
    );
    const walkFromMins = getWalkingMinutes(walkFromDist);

    return {
        totalScore: waitMins + busMins + walkFromMins,
        waitMins,
        busMins,
        walkFromMins,
        walkFromDist
    };
}

/**
 * Evaluate and score multiple route candidates
 * @param {Array} candidates - Array of {route, destStop} objects
 * @param {Object} destLocation - Final destination
 * @param {string} currentTime - Current time
 * @param {string} dayName - Day name
 * @returns {Object} Best route selection with scores
 */
function evaluateCandidates(candidates, destLocation, currentTime, dayName) {
    let bestRoute = null;
    let bestScore = Infinity;
    let bestDestStop = null;
    let bestDeparture = null;

    // Also track best non-loop route separately
    let bestNonLoopRoute = null;
    let bestNonLoopScore = Infinity;
    let bestNonLoopStop = null;
    let bestNonLoopDeparture = null;

    for (const { route, destStop } of candidates) {
        let departure = getNextDeparture(route, route.originStopIndex, currentTime, dayName);

        // Try next day if no bus today
        if (!departure) {
            const nextBus = findNextAvailableBusForRoute(route, currentTime, dayName);
            if (nextBus) {
                const currentMins = timeToMinutes(currentTime);
                const nextMins = timeToMinutes(nextBus.time);
                let diff = nextMins - currentMins;
                if (diff < 0) diff += 24 * 60;

                departure = {
                    time: nextBus.time,
                    minutesUntil: diff,
                    tripStartTime: nextBus.tripStartTime
                };
            }
        }

        if (!departure) continue;

        const score = scoreRoute(route, departure, destStop, destLocation);

        // Track best non-loop route (prefer for short walks)
        if (!route.isLoop && score.walkFromDist < 500) {
            if (score.totalScore < bestNonLoopScore) {
                bestNonLoopScore = score.totalScore;
                bestNonLoopRoute = route;
                bestNonLoopStop = destStop;
                bestNonLoopDeparture = departure;
            }
        }

        if (score.totalScore < bestScore) {
            bestScore = score.totalScore;
            bestRoute = route;
            bestDestStop = destStop;
            bestDeparture = departure;
        }
    }

    // Prefer non-loop route if comparable (within 10 mins)
    if (bestRoute?.isLoop && bestNonLoopRoute && bestNonLoopScore <= bestScore + 10) {
        return {
            route: bestNonLoopRoute,
            destStop: bestNonLoopStop,
            departure: bestNonLoopDeparture,
            score: bestNonLoopScore
        };
    }

    return {
        route: bestRoute,
        destStop: bestDestStop,
        departure: bestDeparture,
        score: bestScore
    };
}

/**
 * Check if walking is more efficient than taking the bus
 * @param {Object} route - Best route found
 * @param {Object} originCoords - User origin
 * @param {Object} originStop - Boarding stop
 * @param {Object} destStop - Alighting stop
 * @param {Object} destLocation - Final destination
 * @param {number} directDistance - Direct walking distance
 * @param {Object} departure - Departure info
 * @returns {boolean} True if walking is better
 */
function isWalkingBetter(route, originCoords, originStop, destStop, destLocation, directDistance, departure) {
    if (directDistance >= PREFER_WALK_THRESHOLD_M) return false;

    const walkToOrigin = haversineDistance(originCoords.lat, originCoords.lon, originStop.lat, originStop.lon);
    const walkFromDest = haversineDistance(destStop.lat, destStop.lon, destLocation.lat, destLocation.lon);

    const walkToMins = getWalkingMinutes(walkToOrigin);
    const waitMins = departure.minutesUntil || 0;
    const busMins = getBusTravelMinutes(route);
    const walkFromMins = getWalkingMinutes(walkFromDest);

    const totalBusTime = walkToMins + waitMins + busMins + walkFromMins;
    const totalWalkTime = getWalkingMinutes(directDistance);

    // Prefer walking if faster, or if significantly more stops
    const stopCount = route.isLoop
        ? route.stopsSequence.length - 1
        : route.destStopIndex - route.originStopIndex;

    // Only prefer walking if it's genuinely faster or the route has many stops (>15)
    // Don't unconditionally reject loop routes - they may be optimal with intermediate stops
    return totalWalkTime <= totalBusTime || stopCount > 15;
}

module.exports = {
    scoreRoute,
    evaluateCandidates,
    isWalkingBetter,
    getBusTravelMinutes,
    getWalkingMinutes,
    WALKING_SPEED_MPS,
    WALK_ONLY_THRESHOLD_M,
    PREFER_WALK_THRESHOLD_M
};
