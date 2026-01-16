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
    findOptimalPath,
    evaluateCandidates,
    isWalkingBetter,
    WALK_ONLY_THRESHOLD_M,
    getWalkingMinutes
} = require('./routingEngine');
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

    // 2. Find stops near destination (needed for A* destination node)
    const destNearestStops = findNearestStopsSync(destLocation, 5);
    if (destNearestStops.length === 0) {
        // This might be too strict for A* if destination is far from any stop but reachable by walking.
        // A* should handle this by having a walk-to-destination node.
        // For now, keep it as a sanity check.
        console.warn('No bus stops found near destination for A* pathfinding. A* will rely on walk-to-destination.');
    }
    const destStop = destNearestStops[0];

    // 3. Resolve origin
    let originCoords;
    let originLocation; // To hold name for response builder

    if (originStopId) {
        const originStop = getStopById(originStopId);
        if (!originStop) {
            return { error: 'Origin stop not found' };
        }
        originCoords = { lat: originStop.lat, lon: originStop.lon };
        originLocation = originStop; // Use stop as origin location
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

    // 4. Run A* Pathfinding (Unifies Direct, Loop, Transfer, and Walk optimizations)
    console.log(`DEBUG: Running A* search from ${originCoords.lat},${originCoords.lon} to ${destLocation.name}`);


    // Check for walk-only preference or very short distance
    const walkOnlyDist = haversineDistance(originCoords.lat, originCoords.lon, destLocation.lat, destLocation.lon);

    // Optimization: If extremely close < 300m, just walk (unless forceBus)
    if (!forceBus && walkOnlyDist < 300) {
        console.log('DEBUG: Destination is very close, suggesting walking.');
        const walkingDetails = await getWalkingDirections(originCoords, destLocation);
        return buildWalkResponse(originCoords, destLocation, walkOnlyDist, null, walkingDetails, originLocation?.name);
    }

    // 4. Calculate optimal path using A*
    const bestPath = findOptimalPath(originCoords.lat, originCoords.lon, destLocation, currentTime, dayName);

    if (!bestPath) {
        console.log('DEBUG: No transit path found via A*. Checking for future buses...');

        let alternativeBus = null;
        const primaryOriginStop = originStopId ? getStopById(originStopId) : userNearestStops[0];
        const primaryDestStop = destNearestStops[0];

        if (primaryDestStop) {
            const originStops = originStopId ? [getStopById(originStopId)] : userNearestStops;

            // 1. Check Direct Routes from ANY nearby origin stop
            for (const startStop of originStops) {
                const directRoutes = findDirectRoutes(startStop.id, primaryDestStop.id);
                if (directRoutes.length > 0) {
                    const route = directRoutes[0];
                    const nextBus = findNextAvailableBusForRoute(route, currentTime, dayName);

                    if (nextBus) {
                        const nowMins = timeToMinutes(currentTime);
                        const busMins = timeToMinutes(nextBus.time);
                        let wait = busMins - nowMins;
                        if (wait < 0) wait += 24 * 60;

                        alternativeBus = {
                            routeName: route.routeName,
                            headsign: route.headsign,
                            originName: startStop.name, // Tell user where to walk
                            nextDeparture: nextBus.time,
                            minutesUntil: wait,
                            warning: 'No buses available right now.'
                        };
                        break; // Found a valid option
                    }
                }
            }

            // 2. If no direct route from nearby stops, try Transfer Routes (from primary stop)
            if (!alternativeBus && originStops.length > 0) {
                const startStop = originStops[0];
                const { stopsById } = getIndexes();
                const transferCandidates = findTransferCandidates(startStop.id, destLocation, MAX_WALKING_FROM_STOP_M, stopsById);

                if (transferCandidates.length > 0) {
                    let bestFutureBus = null;
                    let minWaitMins = Infinity;

                    for (const cand of transferCandidates) {
                        for (const leg1 of cand.firstLegs) {
                            const nextBus = findNextAvailableBusForRoute(leg1, currentTime, dayName);
                            if (nextBus) {
                                const nowMins = timeToMinutes(currentTime);
                                const busMins = timeToMinutes(nextBus.time);
                                let wait = busMins - nowMins;
                                if (wait < 0) wait += 24 * 60; // Next day

                                if (wait < minWaitMins) {
                                    minWaitMins = wait;
                                    bestFutureBus = {
                                        route: leg1,
                                        nextBus,
                                        wait
                                    };
                                }
                            }
                        }
                    }

                    if (bestFutureBus) {
                        alternativeBus = {
                            routeName: bestFutureBus.route.routeName,
                            headsign: `${bestFutureBus.route.headsign} (Transfer)`,
                            nextDeparture: bestFutureBus.nextBus.time,
                            minutesUntil: bestFutureBus.wait,
                            warning: 'No buses available right now (Transfer Required).'
                        };
                    }
                }
            }
        }

        // If still no alternative bus found, set a generic warning so UI shows Amber
        if (!alternativeBus) {
            alternativeBus = {
                warning: 'No bus routes found availability.'
            };
        }

        // Fallback to pure walking if no bus route found
        const walkingDetails = await getWalkingDirections(originCoords, destLocation);
        return buildWalkResponse(originCoords, destLocation, walkOnlyDist, alternativeBus, walkingDetails, originLocation?.name);
    }

    // 5. Convert A* Path to API Response
    const busLegs = bestPath.path.filter(step => step.type === 'BUS');

    // Case A: Walk Only (A* decided walking is best)
    if (busLegs.length === 0) {
        if (forceBus) console.log('DEBUG: A* selected walk-only despite forceBus.');
        const walkingDetails = await getWalkingDirections(originCoords, destLocation);
        return buildWalkResponse(originCoords, destLocation, walkOnlyDist, null, walkingDetails, originLocation?.name);
    }

    const indexes = getIndexes();

    // Case B: Direct Bus (1 Leg)
    if (busLegs.length === 1) {
        const leg = busLegs[0];
        const fullRoute = indexes.routesArray.find(r => r.name === leg.routeName);

        // Helper to find the specific route entry in routesByStop that matches
        const originStopRoutes = indexes.routesByStop.get(leg.from.id);
        const routeDef = originStopRoutes.find(r => r.routeName === leg.routeName && r.headsign === leg.headsign);

        // We also need dest index
        const destStopIndex = routeDef.stopsSequence.indexOf(leg.to.id);

        const routeObj = {
            ...routeDef,
            destStopIndex: destStopIndex, // Add dynamic dest index
            isLoop: fullRoute.isLoop || routeDef.headsign.includes('Loop')
        };

        // Fetch walking details
        const walkToOriginStep = bestPath.path[0];
        const lastStep = bestPath.path[bestPath.path.length - 1];

        let walkingToOriginDetails = null;
        let walkingFromDestDetails = null;

        try {
            [walkingToOriginDetails, walkingFromDestDetails] = await Promise.all([
                (walkToOriginStep.type === 'WALK')
                    ? getWalkingDirections(originCoords, { lat: leg.from.lat, lon: leg.from.lon })
                    : Promise.resolve(null),
                (lastStep.type === 'WALK')
                    ? getWalkingDirections({ lat: leg.to.lat, lon: leg.to.lon }, destLocation)
                    : Promise.resolve(null)
            ]);
        } catch (e) {
            console.warn('Walking details fetch failed:', e.message);
        }

        return buildDirectResponse({
            route: routeObj,
            departure: {
                time: leg.departureTime,
                minutesUntil: leg.waitTime,
                tripStartTime: leg.departureTime
            },
            originCoords,
            originStop: leg.from,
            destStop: leg.to,
            destLocation,
            directDistance: walkOnlyDist,
            currentTime,
            dayName,
            departureDay: dayName,
            walkingToOriginDetails: walkingToOriginDetails?.steps,
            walkingFromDestDetails: walkingFromDestDetails?.steps,
            originName: originLocation?.name
        });
    }

    // Case C: Transfer (2+ Legs)
    if (busLegs.length >= 2) {
        // Resolve all bus legs from A* results
        const resolvedBusLegs = await Promise.all(busLegs.map(async (leg) => {
            const routes = indexes.routesByStop.get(leg.from.id);
            const routeDef = routes.find(r => r.routeName === leg.routeName && r.headsign === leg.headsign);
            const destIndex = routeDef.stopsSequence.indexOf(leg.to.id);

            return {
                route: {
                    ...routeDef,
                    destStopIndex: destIndex,
                    fromStopName: leg.from.name,
                    toStopName: leg.to.name,
                    fromStopId: leg.from.id,
                    toStopId: leg.to.id,
                    fromStopLat: leg.from.lat,
                    fromStopLon: leg.from.lon,
                    toStopLat: leg.to.lat,
                    toStopLon: leg.to.lon
                },
                departure: { time: leg.departureTime, tripStartTime: leg.departureTime },
                arrivalTime: leg.arrivalTimeStr
            };
        }));

        const leg1 = resolvedBusLegs[0];
        const lastLeg = resolvedBusLegs[resolvedBusLegs.length - 1];

        let walkingToOriginDetails = null;
        let walkingFromDestDetails = null;

        try {
            [walkingToOriginDetails, walkingFromDestDetails] = await Promise.all([
                (bestPath.path[0].type === 'WALK')
                    ? getWalkingDirections(originCoords, { lat: busLegs[0].from.lat, lon: busLegs[0].from.lon })
                    : Promise.resolve(null),
                (bestPath.path[bestPath.path.length - 1].type === 'WALK')
                    ? getWalkingDirections({ lat: busLegs[busLegs.length - 1].to.lat, lon: busLegs[busLegs.length - 1].to.lon }, destLocation)
                    : Promise.resolve(null)
            ]);
        } catch (e) {
            console.warn('Walking details fetch failed:', e.message);
        }

        return buildTransferResponse({
            busLegs: resolvedBusLegs,
            originCoords,
            originStop: busLegs[0].from,
            destStop: busLegs[busLegs.length - 1].to,
            destLocation,
            directDistance: walkOnlyDist,
            currentTime,
            departureDay: dayName,
            walkingToOriginDetails: walkingToOriginDetails?.steps,
            walkingFromDestDetails: walkingFromDestDetails?.steps
        });
    }
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
        walkingFromDestDetails: walkingFromDestDetails?.steps,
        originName: originLocation?.name
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
