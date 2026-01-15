/**
 * directions/index.js - Main routing orchestrator
 * Clean entry point that coordinates all direction-finding modules
 */

const { haversineDistance } = require('../utils/geo');
const { getScheduleData, getRouteGeometries } = require('./dataLoader');
const { getStopById, getLocationById, findNearestStops, findNearestStopsSync } = require('./locationService');
const { getRoutesForStop, findDirectRoutes, findRoutesToNearbyStops, findTransferRoutes, findTransferCandidates, TRANSFER_POINTS } = require('./routeFinder');
const { getIndexes } = require('./dataLoader');
const {
    getCurrentDayName,
    getNextDeparture,
    findNextAvailableBusForRoute,
    getDynamicOffset,
    addMinutesToTime,
    timeToMinutes
} = require('./scheduler');
const {
    evaluateCandidates,
    isWalkingBetter,
    WALK_ONLY_THRESHOLD_M,
    WALKING_SPEED_MPS,
    getWalkingMinutes
} = require('./routeScorer');
const { buildWalkResponse, buildDirectResponse, buildTransferResponse, getRouteGeometryKey } = require('./responseBuilder');
const { getWalkingDirections } = require('./walkingService');

const ALTERNATIVE_STOP_RADIUS_M = 500;
const MAX_WALKING_FROM_STOP_M = 800; // Max walking distance from alight stop to destination

/**
 * Main function: Get directions from origin to destination
 * 
 * @param {number|null} originLat - Origin latitude
 * @param {number|null} originLon - Origin longitude  
 * @param {string|null} originStopId - Origin stop ID (if user selected directly)
 * @param {string} destLocationId - Destination location ID
 * @param {string} currentTime - Current time "HH:MM"
 * @param {string|null} dayOverride - Optional day override
 * @param {boolean} forceBus - Force bus route even if walking is better
 * @param {Object|null} pinnedDestination - Direct destination coords for pinned locations
 * @returns {Object} Directions response
 */
async function getDirections(originLat, originLon, originStopId, destLocationId, currentTime, dayOverride = null, forceBus = false, pinnedDestination = null) {
    const dayName = getCurrentDayName(dayOverride);

    // 1. Resolve destination - use pinnedDestination if provided, otherwise lookup
    let destLocation = pinnedDestination || getLocationById(destLocationId);
    if (!destLocation) {
        return { error: 'Destination not found' };
    }

    // 2. Find stops near destination
    const destNearestStops = findNearestStopsSync(destLocation, 5);
    if (destNearestStops.length === 0) {
        return { error: 'No bus stops found near destination' };
    }
    const destStop = destNearestStops[0];

    // 3. Resolve origin
    let originCoords;
    let userNearestStops;

    if (originStopId) {
        const originStop = getStopById(originStopId);
        if (!originStop) {
            return { error: 'Origin stop not found' };
        }
        originCoords = { lat: originStop.lat, lon: originStop.lon };
        userNearestStops = [originStop];
    } else if (originLat !== null && originLon !== null) {
        originCoords = { lat: originLat, lon: originLon };
        userNearestStops = await findNearestStops(originLat, originLon, 5);
    } else {
        return {
            error: 'No origin provided',
            suggestion: 'Please enable GPS or select a starting point.'
        };
    }

    // 4. Calculate direct distance
    const directDistance = haversineDistance(
        originCoords.lat, originCoords.lon,
        destLocation.lat, destLocation.lon
    );

    // 5. Check if close enough to walk
    if (!forceBus && directDistance < WALK_ONLY_THRESHOLD_M) {
        // Check for quick bus alternative
        const primaryStop = userNearestStops[0];
        const directRoutes = findDirectRoutes(primaryStop.id, destStop.id);
        let alternativeBus = null;

        if (directRoutes.length > 0) {
            const route = directRoutes[0];
            const nextDep = getNextDeparture(route, route.originStopIndex, currentTime, dayName);
            if (nextDep && nextDep.minutesUntil <= 10) {
                alternativeBus = {
                    routeName: route.routeName,
                    headsign: route.headsign,
                    nextDeparture: nextDep.time,
                    minutesUntil: nextDep.minutesUntil
                };
            }
        }

        // Get step-by-step walking directions from GraphHopper
        const walkingDetails = await getWalkingDirections(originCoords, destLocation);
        // Determine origin name: use the nearest stop name if user didn't select a specific stop
        const originName = originStopId ? primaryStop.name : (userNearestStops[0]?.name || null);
        return buildWalkResponse(originCoords, destLocation, directDistance, alternativeBus, walkingDetails, originName);
    }

    // 6. Find best route from all candidate stops within walking distance
    const primaryStop = userNearestStops[0];
    const indexes = getIndexes();

    // Use new function to find ALL reachable stops within walking distance
    // This considers alighting at intermediate stops (e.g., alight at CP instead of full loop)
    let candidates = findRoutesToNearbyStops(
        primaryStop.id,
        destLocation,
        MAX_WALKING_FROM_STOP_M,
        indexes.stopsById
    );

    console.log('DEBUG: findRoutesToNearbyStops returned', candidates.length, 'candidates');
    candidates.forEach((c, i) => {
        console.log(`  Candidate ${i}: ${c.route.routeName} (${c.route.headsign}) -> ${c.destStop.name || c.destStop.id}, isLoop: ${c.route.isLoop}, walk: ${Math.round(c.destStop.dist)}m`);
    });

    // Also add exact destination stop matches from destNearestStops (for backward compatibility)
    console.log('DEBUG: Checking destNearestStops for direct routes...');
    for (const candidateDest of destNearestStops.slice(0, 5)) {
        console.log(`  Checking dest stop: ${candidateDest.id} (${candidateDest.name})`);
        const routes = findDirectRoutes(primaryStop.id, candidateDest.id);
        console.log(`  findDirectRoutes returned ${routes.length} routes`);
        routes.forEach(r => console.log(`    Route: ${r.routeName} (${r.headsign}), isLoop: ${r.isLoop}`));

        for (const route of routes) {
            // Check if this candidate is already in the list
            const exists = candidates.some(c =>
                c.route.routeName === route.routeName &&
                c.route.headsign === route.headsign &&
                c.destStop.id === candidateDest.id
            );
            if (!exists) {
                candidates.push({ route, destStop: candidateDest });
                console.log(`  Added from destNearestStops: ${route.routeName} (${route.headsign}) -> ${candidateDest.name}, isLoop: ${route.isLoop}`);
            }
        }
    }

    console.log('DEBUG: Total candidates:', candidates.length);

    let { route: bestRoute, destStop: bestDestStop, departure } = evaluateCandidates(
        candidates, destLocation, currentTime, dayName
    );

    console.log('DEBUG: Best route selected:', bestRoute?.routeName, bestRoute?.headsign, 'isLoop:', bestRoute?.isLoop, 'alight at:', bestDestStop?.name);

    // 7. Check if walking is more efficient
    let inefficientRoute = null;
    if (!forceBus && bestRoute && departure) {
        if (isWalkingBetter(bestRoute, originCoords, primaryStop, bestDestStop, destLocation, directDistance, departure)) {
            inefficientRoute = bestRoute;
            bestRoute = null;
        }
    }

    // 8. Try alternative origin stops if no direct route
    let useAlternativeStop = false;
    let alternativeStop = null;

    if (!bestRoute) {
        console.log('DEBUG: Checking alternative origin stops...');
        for (let i = 1; i < userNearestStops.length; i++) {
            const altStop = userNearestStops[i];
            if (altStop.distance > ALTERNATIVE_STOP_RADIUS_M) break;

            console.log(`  Checking alt stop ${altStop.id} (${altStop.name}), dist: ${Math.round(altStop.distance)}m`);

            // First try findRoutesToNearbyStops for intermediate alighting
            const nearbyStopCandidates = findRoutesToNearbyStops(
                altStop.id,
                destLocation,
                MAX_WALKING_FROM_STOP_M,
                indexes.stopsById
            );

            console.log(`  findRoutesToNearbyStops returned ${nearbyStopCandidates.length} candidates`);

            if (nearbyStopCandidates.length > 0) {
                const result = evaluateCandidates(nearbyStopCandidates, destLocation, currentTime, dayName);
                if (result.route) {
                    console.log(`  SELECTED from nearby stops: ${result.route.routeName} -> ${result.destStop.name}`);
                    bestRoute = result.route;
                    bestDestStop = result.destStop;
                    departure = result.departure;
                    alternativeStop = altStop;
                    useAlternativeStop = true;
                    break;
                }
            }

            // Fallback to findDirectRoutes (inc. loop routes)
            const altRoutes = findDirectRoutes(altStop.id, destStop.id);
            if (altRoutes.length > 0) {
                console.log(`  findDirectRoutes returned ${altRoutes.length} routes`);
                altRoutes.forEach(r => console.log(`    ${r.routeName} (${r.headsign}), isLoop: ${r.isLoop}`));

                const altCandidates = altRoutes.map(r => ({ route: r, destStop }));
                const result = evaluateCandidates(altCandidates, destLocation, currentTime, dayName);
                if (result.route) {
                    console.log(`  SELECTED from direct routes: ${result.route.routeName}`);
                    bestRoute = result.route;
                    bestDestStop = result.destStop;
                    departure = result.departure;
                    alternativeStop = altStop;
                    useAlternativeStop = true;
                    break;
                }
            }
        }
    }

    // 9. If walking was better than inefficient route
    if (!bestRoute && inefficientRoute) {
        const nextDep = getNextDeparture(inefficientRoute, inefficientRoute.originStopIndex, currentTime, dayName);
        const altBusInfo = nextDep ? {
            routeName: inefficientRoute.routeName,
            headsign: inefficientRoute.headsign,
            nextDeparture: nextDep.time,
            minutesUntil: nextDep.minutesUntil
        } : null;

        // Get step-by-step walking directions from GraphHopper
        const walkingDetails = await getWalkingDirections(originCoords, destLocation);
        // Determine origin name: use the nearest stop name if user didn't select a specific stop
        const originName = originStopId ? primaryStop.name : (userNearestStops[0]?.name || null);
        return buildWalkResponse(originCoords, destLocation, directDistance, altBusInfo, walkingDetails, originName);
    }

    // 10. Try transfer routes if no direct route
    if (!bestRoute) {
        console.log('DEBUG: Searching for transfer routes...');
        const allTransferCandidates = [];

        // 10a. From primary stop
        const primaryCandidates = findTransferCandidates(primaryStop.id, destLocation, MAX_WALKING_FROM_STOP_M, indexes.stopsById);
        primaryCandidates.forEach(c => allTransferCandidates.push({ ...c, originStop: primaryStop }));
        console.log(`DEBUG: Found ${primaryCandidates.length} transfer candidates from primary stop`);

        // 10b. From alternative stops
        for (let i = 1; i < userNearestStops.length; i++) {
            const altStop = userNearestStops[i];
            if (altStop.distance > 300) break;

            const altCandidates = findTransferCandidates(altStop.id, destLocation, MAX_WALKING_FROM_STOP_M, indexes.stopsById);
            altCandidates.forEach(c => allTransferCandidates.push({ ...c, originStop: altStop }));
        }

        if (allTransferCandidates.length > 0) {
            console.log(`DEBUG: Evaluating ${allTransferCandidates.length} total transfer candidates`);
            const result = await selectAndBuildBestTransfer(
                allTransferCandidates,
                originCoords,
                destLocation,
                directDistance,
                currentTime,
                dayName
            );

            if (result) return result;
        }

        // No route found logic
        const originRoutes = getRoutesForStop(primaryStop.id);
        const destRoutes = getRoutesForStop(destStop.id);
        return {
            error: 'No route found',
            suggestion: `No bus connection found from ${primaryStop.name} to ${destStop.name}.`,
            debug: {
                originStop: primaryStop.name,
                destStop: destStop.name,
                originServedBy: [...new Set(originRoutes.map(r => r.routeName))],
                destServedBy: [...new Set(destRoutes.map(r => r.routeName))]
            }
        };
    }

    // 11. Get departure info
    let departureDay = null;
    if (!departure) {
        const nextBus = findNextAvailableBusForRoute(bestRoute, currentTime, dayName);
        if (nextBus) {
            departure = { time: nextBus.time, minutesUntil: null, tripStartTime: nextBus.tripStartTime };
            departureDay = nextBus.day;
        } else {
            return { error: 'No bus service available' };
        }
    }

    // 12. Build direct response
    const originStop = useAlternativeStop ? alternativeStop : primaryStop;
    bestRoute._actualDestStop = bestDestStop;

    console.log(`DEBUG: bestRoute found: ${bestRoute.routeName} to ${bestDestStop.name}`);

    // Fetch detailed walking directions in parallel
    let walkingToOriginDetails = null;
    let walkingFromDestDetails = null;

    try {
        console.log(`DEBUG: Fetching walking details for ${bestRoute.routeName}...`);
        console.log(`DEBUG: Origin: ${originCoords.lat},${originCoords.lon} -> Stop: ${originStop.lat},${originStop.lon}`);
        console.log(`DEBUG: Stop: ${bestDestStop.lat},${bestDestStop.lon} -> Dest: ${destLocation.lat},${destLocation.lon}`);

        [walkingToOriginDetails, walkingFromDestDetails] = await Promise.all([
            getWalkingDirections(originCoords, { lat: originStop.lat, lon: originStop.lon }),
            getWalkingDirections({ lat: bestDestStop.lat, lon: bestDestStop.lon }, destLocation)
        ]);

        console.log(`DEBUG: Walking details fetched. Origin steps: ${walkingToOriginDetails?.steps?.length}, Dest steps: ${walkingFromDestDetails?.steps?.length}`);
    } catch (err) {
        console.error('Error fetching walking details:', err.message);
        // Continue without detailed walking steps (fallback to Haversine summary)
    }

    return buildDirectResponse({
        route: bestRoute,
        departure,
        originCoords,
        originStop,
        destStop: bestDestStop,
        destLocation,
        directDistance,
        currentTime,
        dayName,
        departureDay,
        walkingToOriginDetails: walkingToOriginDetails?.steps,
        walkingFromDestDetails: walkingFromDestDetails?.steps
    });
}

/**
 * Handle transfer route building
 */
/**
 * Evaluate transfer candidates to find the best one and build the response
 */
async function selectAndBuildBestTransfer(candidates, originCoords, destLocation, directDistance, currentTime, dayName) {
    const { getStopById } = require('./locationService');

    let bestOption = null;
    let minTotalDuration = Infinity;

    for (const cand of candidates) {
        const { transferPoint, firstLegs, secondLeg, destStop, originStop } = cand;
        const transferStop = getStopById(transferPoint);

        // 1. First Leg Optimization
        let bestLeg1 = null;
        let leg1Departure = null;
        let leg1ArrivalMins = Infinity;

        // Iterate all potential routes for the first leg calculate earliest arrival
        for (const leg1 of firstLegs) {
            let dep = getNextDeparture(leg1, leg1.originStopIndex, currentTime, dayName);

            if (!dep) {
                const nextBus = findNextAvailableBusForRoute(leg1, currentTime, dayName);
                if (nextBus) {
                    // Approximate minutes until next day (not perfect but functional for ranking)
                    const nowMins = timeToMinutes(currentTime);
                    const nextMins = timeToMinutes(nextBus.time);
                    let diff = nextMins - nowMins;
                    if (diff < 0) diff += 24 * 60;

                    dep = {
                        time: nextBus.time,
                        minutesUntil: diff,
                        tripStartTime: nextBus.tripStartTime,
                        day: nextBus.day
                    };
                }
            }

            if (dep) {
                const originOffset = getDynamicOffset(leg1.routeName, leg1.headsign, leg1.originStopIndex) || 0;
                const destOffset = getDynamicOffset(leg1.routeName, leg1.headsign, leg1.destStopIndex) || 0;
                const travelMins = Math.max(0, destOffset - originOffset);
                const totalMinsUntilArrival = (dep.minutesUntil || 0) + travelMins;

                if (totalMinsUntilArrival < leg1ArrivalMins) {
                    leg1ArrivalMins = totalMinsUntilArrival;
                    bestLeg1 = leg1;
                    leg1Departure = dep;
                }
            }
        }

        if (!bestLeg1) continue;

        // 2. Second Leg Optimization
        const arrivalTimeAtTransfer = addMinutesToTime(currentTime, leg1ArrivalMins);
        // 5 minute buffer for transfer
        const transferReadyTime = addMinutesToTime(arrivalTimeAtTransfer, 5);

        // Find departure for second leg 
        // Note: dayName handling for next day transfers is complex, simplified here to assume same day or immediate next
        let leg2Departure = getNextDeparture(secondLeg, secondLeg.originStopIndex, transferReadyTime, dayName);

        if (!leg2Departure) {
            const nextBus2 = findNextAvailableBusForRoute(secondLeg, transferReadyTime, dayName);
            if (nextBus2) {
                const nowMins = timeToMinutes(transferReadyTime);
                const nextMins = timeToMinutes(nextBus2.time);
                let diff = nextMins - nowMins;
                if (diff < 0) diff += 24 * 60;

                leg2Departure = {
                    time: nextBus2.time,
                    minutesUntil: diff,
                    tripStartTime: nextBus2.tripStartTime
                };
            }
        }

        if (!leg2Departure) continue;

        // 3. Score Total Journey
        const walkFromDest = haversineDistance(destStop.lat, destStop.lon, destLocation.lat, destLocation.lon);
        const walkFromMins = getWalkingMinutes(walkFromDest);

        const leg2OriginOffset = getDynamicOffset(secondLeg.routeName, secondLeg.headsign, secondLeg.originStopIndex) || 0;
        const leg2DestOffset = getDynamicOffset(secondLeg.routeName, secondLeg.headsign, secondLeg.destStopIndex) || 0;
        const leg2TravelMins = Math.max(0, leg2DestOffset - leg2OriginOffset);

        // Total minutes from NOW
        const totalDuration = leg1ArrivalMins + 5 + (leg2Departure.minutesUntil || 0) + leg2TravelMins + walkFromMins;

        if (totalDuration < minTotalDuration) {
            minTotalDuration = totalDuration;
            bestOption = {
                candidate: cand,
                leg1: bestLeg1,
                leg1Departure,
                leg2: secondLeg,
                leg2Departure,
                transferStop,
                walkFromDest,
                totalDuration
            };
        }
    }

    if (!bestOption) return null;

    // 4. Build Response for Best Option
    const { candidate, leg1, leg1Departure, leg2, leg2Departure, transferStop } = bestOption;

    let walkingToOriginDetails = null;
    let walkingFromDestDetails = null;

    try {
        const originStop = candidate.originStop;
        [walkingToOriginDetails, walkingFromDestDetails] = await Promise.all([
            getWalkingDirections(originCoords, { lat: originStop.lat, lon: originStop.lon }),
            getWalkingDirections({ lat: candidate.destStop.lat, lon: candidate.destStop.lon }, destLocation)
        ]);
    } catch (err) {
        console.error('Error fetching walking details for transfer:', err.message);
    }

    return buildTransferResponse({
        firstLeg: leg1,
        secondLeg: leg2,
        transferStop,
        transferPointId: candidate.transferPoint,
        firstDeparture: leg1Departure,
        secondDeparture: leg2Departure,
        originCoords,
        originStop: candidate.originStop,
        destStop: candidate.destStop,
        destLocation,
        directDistance,
        currentTime,
        departureDay: leg1Departure.day || null,
        walkingToOriginDetails: walkingToOriginDetails?.steps,
        walkingFromDestDetails: walkingFromDestDetails?.steps
    });
}

// Re-export for backward compatibility
module.exports = {
    getDirections,
    findNearestStops,
    getRoutesForStop,
    findDirectRoutes,
    findTransferRoutes,
    getStopById,
    getLocationById,
    haversineDistance
};
