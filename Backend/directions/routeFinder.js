/**
 * routeFinder.js - Optimized route discovery using pre-computed indexes
 */

const { getIndexes } = require('./dataLoader');

const CP_STOP_ID = 'CP';

/**
 * Get routes for a stop - O(1) lookup
 */
function getRoutesForStop(stopId) {
    const routes = getIndexes().routesByStop.get(stopId);
    return routes || [];
}

/**
 * Find direct routes - optimized with indexed lookups
 */
function findDirectRoutes(originStopId, destStopId) {
    const originRoutes = getRoutesForStop(originStopId);
    if (originRoutes.length === 0) return [];

    const directRoutes = [];

    for (const route of originRoutes) {
        const destIndex = route.stopsSequence.indexOf(destStopId);

        if (destIndex !== -1 && destIndex > route.stopIndex) {
            directRoutes.push({
                ...route,
                originStopIndex: route.stopIndex,
                destStopIndex: destIndex
            });
        }
    }

    // Check loop routes if no direct found
    if (directRoutes.length === 0) {
        const loopRoutes = findLoopRoutes(originStopId, destStopId);
        directRoutes.push(...loopRoutes);
    }

    return directRoutes;
}

/**
 * Find all routes from origin with ALL subsequent stops as potential alight points
 * This allows the scoring algorithm to pick the optimal alight stop based on walking distance
 * @param {string} originStopId - Origin stop ID
 * @param {Object} destLocation - Destination location {lat, lon}
 * @param {number} maxWalkingDistanceM - Maximum walking distance from alight stop to destination
 * @param {Map} stopsById - Map of stop IDs to stop objects
 * @returns {Array} Array of {route, destStop} candidates
 */
function findRoutesToNearbyStops(originStopId, destLocation, maxWalkingDistanceM, stopsById) {
    const { haversineDistance } = require('../utils/geo');
    const originRoutes = getRoutesForStop(originStopId);
    const candidates = [];
    const seenCombinations = new Set(); // Avoid duplicates


    for (const route of originRoutes) {
        const originIdx = route.stopIndex;


        // Check all stops AFTER the origin on this route
        for (let i = originIdx + 1; i < route.stopsSequence.length; i++) {
            const stopId = route.stopsSequence[i];
            const stop = stopsById.get(stopId);
            if (!stop) continue;

            // Calculate walking distance from this stop to destination
            const walkDist = haversineDistance(stop.lat, stop.lon, destLocation.lat, destLocation.lon);

            if (walkDist <= maxWalkingDistanceM) {
                const key = `${route.routeName}:${route.headsign}:${stopId}`;
                if (seenCombinations.has(key)) continue;
                seenCombinations.add(key);


                candidates.push({
                    route: {
                        ...route,
                        originStopIndex: originIdx,
                        destStopIndex: i
                    },
                    destStop: {
                        ...stop,
                        dist: walkDist
                    }
                });
            }
        }
    }

    return candidates;
}

/**
 * Find loop routes - optimized using pre-grouped trips
 */
function findLoopRoutes(originStopId, destStopId) {
    const indexes = getIndexes();
    const loopRoutes = [];


    for (const [routeName, trips] of indexes.tripsByRoute) {
        // Find origin trip using pre-built Set for O(1) contains check
        const originTrip = trips.find(t => t.stopsSet.has(originStopId));
        if (!originTrip) continue;


        const originIdx = originTrip.stopsSequence.indexOf(originStopId);

        for (const destTrip of trips) {
            if (destTrip.headsign === originTrip.headsign) continue;

            // Fast day overlap check
            const hasCommonDay = originTrip.serviceDays.some(day =>
                destTrip.serviceDays.includes(day)
            );
            if (!hasCommonDay) continue;

            if (routeName.includes('Route E') &&
                originTrip.headsign.includes('To KDOJ') &&
                destTrip.headsign.includes('To Cluster')) {
                continue;
            }

            if (!destTrip.stopsSet.has(destStopId)) continue;

            const destIdx = destTrip.stopsSequence.indexOf(destStopId);


            const commonDays = originTrip.serviceDays.filter(d =>
                destTrip.serviceDays.includes(d)
            );

            const remainingOriginStops = originTrip.stopsSequence.slice(originIdx);
            const stopsToDestination = destTrip.stopsSequence.slice(0, destIdx + 1);

            loopRoutes.push({
                routeName,
                headsign: `${originTrip.headsign} → ${destTrip.headsign}`,
                isLoop: true,
                originTrip,
                destTrip,
                originStopIndex: originIdx,
                destStopIndex: destIdx,
                stopsSequence: [...remainingOriginStops, ...stopsToDestination],
                times: originTrip.times,
                serviceDays: commonDays,
                loopInfo: {
                    firstLeg: originTrip.headsign,
                    secondLeg: destTrip.headsign,
                    transferPoint: originTrip.stopsSequence[originTrip.stopsSequence.length - 1]
                }
            });
        }
    }

    return loopRoutes;
}

/**
 * Find transfer routes via a transfer point
 */
function findTransferRoutes(originStopId, destStopId, transferStopId = CP_STOP_ID) {
    const toTransfer = findDirectRoutes(originStopId, transferStopId);
    if (toTransfer.length === 0) return null;

    const fromTransfer = findDirectRoutes(transferStopId, destStopId);
    if (fromTransfer.length === 0) return null;

    const { getStopById } = require('./locationService');

    return {
        type: 'TRANSFER',
        transferStop: getStopById(transferStopId),
        firstLeg: toTransfer,
        secondLeg: fromTransfer
    };
}

/**
 * Find transfer candidates that reach any stop near the destination
 * @param {string} originStopId 
 * @param {Object} destLocation 
 * @param {number} maxWalkingDistanceM 
 * @param {Map} stopsById 
 * @returns {Array} List of transfer candidates
 */
function findTransferCandidates(originStopId, destLocation, maxWalkingDistanceM, stopsById) {
    const candidates = [];
    const seenCombinations = new Set();


    for (const transferPoint of TRANSFER_POINTS) {
        if (transferPoint === originStopId) continue;

        // 1. Find routes to transfer point
        const legs1 = findDirectRoutes(originStopId, transferPoint);
        if (legs1.length === 0) continue;

        // 2. Find routes from transfer point to nearby stops
        const leg2Candidates = findRoutesToNearbyStops(
            transferPoint,
            destLocation,
            maxWalkingDistanceM,
            stopsById
        );

        for (const leg2 of leg2Candidates) {
            // Unique key for this specific transfer combination
            // key: transferPoint + leg2Route + leg2Dest
            const key = `${transferPoint}|${leg2.route.routeName}:${leg2.route.headsign}|${leg2.destStop.id}`;
            if (seenCombinations.has(key)) continue;
            seenCombinations.add(key);

            candidates.push({
                type: 'TRANSFER',
                transferPoint,
                firstLegs: legs1,       // All possible first legs
                secondLeg: leg2.route,  // Specific second leg
                destStop: leg2.destStop
            });
        }
    }

    return candidates;
}

const TRANSFER_POINTS = ['CP', 'KTC', 'AM', 'KRP'];

module.exports = {
    getRoutesForStop,
    findDirectRoutes,
    findRoutesToNearbyStops,
    findLoopRoutes,
    findTransferRoutes,
    findTransferCandidates,
    TRANSFER_POINTS,
    CP_STOP_ID
};
