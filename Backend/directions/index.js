/**
 * directions/index.js - Main routing orchestrator
 * Clean entry point that coordinates all direction-finding modules
 */

const { haversineDistance } = require('../utils/geo');
const { getScheduleData, getRouteGeometries, getIndexes } = require('./dataLoader');
const { getStopById, getLocationById, findNearestStops, findNearestStopsSync } = require('./locationService');
const { getRoutesForStop, findDirectRoutes, findRoutesToNearbyStops, findTransferRoutes, findTransferCandidates, TRANSFER_POINTS } = require('./routeFinder');
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
async function getDirections(originLat, originLon, originStopId, destLocationId, currentTime, dayOverride = null, forceBus = false, pinnedDestination = null, isAnytime = false) {
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
    let userNearestStops = []; // Populated when origin is GPS coordinates

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
        const response = buildWalkResponse(originCoords, destLocation, directDistance, alternativeBus, walkingDetails, originName);
        if (directDistance < 300) {
            response.walkingReason = "Destination is very close.";
        } else {
            response.walkingReason = "Walking is faster than waiting for the next bus.";
        }
        return response;
    }

    // 4. Run A* Pathfinding (Unifies Direct, Loop, Transfer, and Walk optimizations)


    // Check for walk-only preference or very short distance
    const walkOnlyDist = haversineDistance(originCoords.lat, originCoords.lon, destLocation.lat, destLocation.lon);

    // Optimization: If extremely close < 300m, just walk (unless forceBus)
    if (!forceBus && walkOnlyDist < 300) {
        const walkingDetails = await getWalkingDirections(originCoords, destLocation);
        return buildWalkResponse(originCoords, destLocation, walkOnlyDist, null, walkingDetails, originLocation?.name);
    }

    // Resolve origin elevation for penalty calculation
    let originElevation = null;
    if (originStopId) {
        const originStop = getStopById(originStopId);
        originElevation = originStop?.elevation;
    } else if (userNearestStops && userNearestStops.length > 0) {
        // If near a stop (< 200m), use its elevation as origin reference
        if (userNearestStops[0].dist < 200) {
            originElevation = userNearestStops[0].elevation;
        }
    }

    // 4. Calculate optimal path using A*
    const bestPath = findOptimalPath(originCoords.lat, originCoords.lon, destLocation, currentTime, dayName, isAnytime, originElevation);

    if (!bestPath) {

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
        const response = buildWalkResponse(originCoords, destLocation, walkOnlyDist, alternativeBus, walkingDetails, originLocation?.name);
        response.walkingReason = "No bus currently scheduled for this trip.";
        if (isAnytime) {
            response.summary.isAnytime = true;
        }
        return response;
    }

    // 5. Convert A* Path to API Response
    const busLegs = bestPath.path.filter(step => step.type === 'BUS');

    // Case A: Walk Only (A* decided walking is best)
    if (busLegs.length === 0) {
        if (forceBus) { /* A* selected walk-only despite forceBus */ }
        const walkingDetails = await getWalkingDirections(originCoords, destLocation);
        const response = buildWalkResponse(originCoords, destLocation, walkOnlyDist, null, walkingDetails, originLocation?.name);
        if (isAnytime) {
            response.summary.isAnytime = true;
        }
        return response;
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
            originStopIndex: routeDef.stopIndex, // Fix NaN stops bug
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

        const response = buildDirectResponse({
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
            walkingToOriginDetails: walkingToOriginDetails,
            walkingFromDestDetails: walkingFromDestDetails,
            originName: originLocation?.name
        });

        if (isAnytime) {
            const nextBus = findNextAvailableBusForRoute(routeObj, currentTime, dayName);
            if (nextBus) {
                response.nextAvailable = {
                    time: nextBus.time,
                    day: nextBus.day
                };
                response.summary.isAnytime = true;
            } else {
                // Even if nextBus is not found (shouldn't happen for a found route),
                // we should still mark it as anytime so the toggle works
                response.summary.isAnytime = true;
            }
        }

        return response;
    }

    // Case C: Transfer (2+ Legs)
    if (busLegs.length >= 2) {
        // Extract transfer walks (walks that occur BETWEEN bus legs)
        const transferWalks = [];
        let busLegIndex = 0;
        for (let i = 0; i < bestPath.path.length; i++) {
            const step = bestPath.path[i];
            if (step.type === 'BUS') {
                busLegIndex++;
            } else if (step.type === 'WALK' && busLegIndex > 0 && busLegIndex < busLegs.length) {
                // This is a walk between bus legs (transfer walk)
                transferWalks.push({
                    afterBusLegIndex: busLegIndex - 1,
                    from: step.from,
                    to: step.to,
                    distance: step.distance,
                    duration: step.duration
                });
            }
        }

        // Resolve all bus legs from A* results
        const resolvedBusLegs = await Promise.all(busLegs.map(async (leg) => {
            const routes = indexes.routesByStop.get(leg.from.id);
            const routeDef = routes.find(r => r.routeName === leg.routeName && r.headsign === leg.headsign);
            const originIndex = routeDef.stopsSequence.indexOf(leg.from.id);
            const destIndex = routeDef.stopsSequence.indexOf(leg.to.id);

            return {
                route: {
                    ...routeDef,
                    originStopIndex: originIndex,  // Fix NaN stops bug
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

        // Merge consecutive same-route legs (e.g., Route F to KTR -> Route F to P19A)
        // These are "stay on bus" transfers where user doesn't need to alight
        const mergedBusLegs = [];
        for (let i = 0; i < resolvedBusLegs.length; i++) {
            const current = resolvedBusLegs[i];

            // Check if this can be merged with the next leg
            if (i < resolvedBusLegs.length - 1) {
                const next = resolvedBusLegs[i + 1];
                // Same route name and same transfer stop = stay on bus
                if (current.route.routeName === next.route.routeName &&
                    current.route.toStopId === next.route.fromStopId) {
                    // Merge: extend current to next's destination
                    mergedBusLegs.push({
                        route: {
                            ...current.route,
                            toStopName: next.route.toStopName,
                            toStopId: next.route.toStopId,
                            toStopLat: next.route.toStopLat,
                            toStopLon: next.route.toStopLon,
                            destStopIndex: next.route.destStopIndex,
                            headsign: current.route.headsign + ' → ' + next.route.headsign,
                            isMergedLeg: true
                        },
                        departure: current.departure,
                        arrivalTime: next.arrivalTime
                    });
                    i++; // Skip the next leg since it's merged
                    continue;
                }
            }
            mergedBusLegs.push(current);
        }

        // Use merged legs instead of original
        const finalBusLegs = mergedBusLegs;

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

        const response = buildTransferResponse({
            busLegs: finalBusLegs,  // Use merged bus legs
            transferWalks,  // Pass transfer walks to response builder
            originCoords,
            originStop: busLegs[0].from,
            destStop: busLegs[busLegs.length - 1].to,
            destLocation,
            directDistance: walkOnlyDist,
            currentTime,
            departureDay: dayName,
            walkingToOriginDetails: walkingToOriginDetails,
            walkingFromDestDetails: walkingFromDestDetails
        });

        if (isAnytime) {
            const nextBus = findNextAvailableBusForRoute(leg1.route, currentTime, dayName);
            if (nextBus) {
                response.nextAvailable = {
                    time: nextBus.time,
                    day: nextBus.day
                };
                response.summary.isAnytime = true;
            }
        }

        return response;
    }
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
