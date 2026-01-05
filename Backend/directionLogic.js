// directionLogic.js
// Core routing algorithm for UTM Move directions feature

const fs = require('fs');
const path = require('path');

// Load data files
const scheduleData = JSON.parse(fs.readFileSync(path.join(__dirname, 'schedule.json'), 'utf8'));
const campusLocations = JSON.parse(fs.readFileSync(path.join(__dirname, 'campus_locations.json'), 'utf8'));
const routeGeometries = JSON.parse(fs.readFileSync(path.join(__dirname, 'route_geometries.json'), 'utf8'));

// Constants
const WALKING_SPEED_MPS = 1.4; // meters per second (~5 km/h)
const WALK_ONLY_THRESHOLD_M = 400; // If destination within 400m, suggest walking
const ALTERNATIVE_STOP_RADIUS_M = 500; // Check for alternative stops within 500m
const CP_STOP_ID = 'CP'; // Centre Point transfer hub

// ... (keep constants) ...

/**
 * Helper to create walk response
 */
function createWalkResponse(originCoords, destLocation, distance, primaryStop, destStopId, alternativeBus = null) {
    const walkDuration = Math.ceil(distance / WALKING_SPEED_MPS / 60);
    return {
        type: 'WALK_ONLY',
        message: distance < 100 ? 'Your destination is right here!' : 'Your destination is very close. We recommend walking.',
        destination: destLocation,
        totalWalkingDistance: Math.round(distance),
        totalDuration: walkDuration,
        alternativeBus,
        walkingRoute: {
            from: originCoords,
            to: { lat: destLocation.lat, lon: destLocation.lon }
        }
    };
}

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
 * Find N nearest bus stops to a coordinate
 */
function findNearestStops(lat, lon, count = 3) {
    const stopsWithDistance = scheduleData.stops.map(stop => ({
        ...stop,
        distance: haversineDistance(lat, lon, stop.lat, stop.lon)
    }));
    stopsWithDistance.sort((a, b) => a.distance - b.distance);
    return stopsWithDistance.slice(0, count);
}

/**
 * Get a stop by ID
 */
function getStopById(stopId) {
    return scheduleData.stops.find(s => s.id === stopId);
}

/**
 * Get a location by ID or name from campus_locations OR bus stops
 * Falls back to bus stop if location not found
 * Supports case-insensitive partial name matching
 */
function getLocationById(locationId) {
    if (!locationId) return null;
    const searchTerm = locationId.toLowerCase();

    // First try exact ID match in campus locations
    let location = campusLocations.locations.find(loc => loc.id === locationId);
    if (location) return location;

    // Try exact ID match in bus stops
    let stop = scheduleData.stops.find(s => s.id === locationId);
    if (stop) {
        return {
            id: stop.id,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon,
            nearestStop: stop.id,
            category: 'bus_stop'
        };
    }

    // Try case-insensitive name match in campus locations
    location = campusLocations.locations.find(loc =>
        loc.name.toLowerCase() === searchTerm
    );
    if (location) return location;

    // Try case-insensitive name match in bus stops
    stop = scheduleData.stops.find(s =>
        s.name.toLowerCase() === searchTerm
    );
    if (stop) {
        return {
            id: stop.id,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon,
            nearestStop: stop.id,
            category: 'bus_stop'
        };
    }

    // Try partial name match in bus stops (e.g., "Kolej 9" matches "Kolej 9")
    stop = scheduleData.stops.find(s =>
        s.name.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(s.name.toLowerCase())
    );
    if (stop) {
        return {
            id: stop.id,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon,
            nearestStop: stop.id,
            category: 'bus_stop'
        };
    }

    return null;
}

/**
 * Get all routes that pass through a specific stop
 * Returns array of { routeName, headsign, stopIndex, stopsSequence }
 */
function getRoutesForStop(stopId) {
    const results = [];
    for (const route of scheduleData.routes) {
        for (const service of route.services) {
            for (const trip of service.trips) {
                const stopIndex = trip.stops_sequence.indexOf(stopId);
                if (stopIndex !== -1) {
                    results.push({
                        routeName: route.name,
                        headsign: trip.headsign,
                        stopIndex,
                        stopsSequence: trip.stops_sequence,
                        times: trip.times,
                        serviceDays: service.days
                    });
                }
            }
        }
    }
    return results;
}

/**
 * Find direct routes that pass through both origin and destination stops
 * The origin stop must come BEFORE the destination stop in the sequence
 */
function findDirectRoutes(originStopId, destStopId) {
    const originRoutes = getRoutesForStop(originStopId);
    const directRoutes = [];

    for (const route of originRoutes) {
        const destIndex = route.stopsSequence.indexOf(destStopId);
        // Destination must be AFTER origin in the route
        if (destIndex !== -1 && destIndex > route.stopIndex) {
            directRoutes.push({
                ...route,
                originStopIndex: route.stopIndex,
                destStopIndex: destIndex
            });
        }
    }

    // If no direct routes found, check for loop routes
    // (origin on one trip, destination on another trip of same route)
    if (directRoutes.length === 0) {
        const loopRoutes = findLoopRoutes(originStopId, destStopId);
        directRoutes.push(...loopRoutes);
    }

    return directRoutes;
}

/**
 * Find loop routes where origin is on one trip and destination is on 
 * a connecting trip of the same route (e.g., Route E "To Cluster" -> "To KDOJ")
 */
function findLoopRoutes(originStopId, destStopId) {
    const loopRoutes = [];

    // Group all trips by route name (without specific headsign)
    const routeTrips = {};

    for (const route of scheduleData.routes) {
        const baseRouteName = route.name; // e.g., "Route E(JA)"

        for (const service of route.services) {
            for (const trip of service.trips) {
                if (!routeTrips[baseRouteName]) {
                    routeTrips[baseRouteName] = [];
                }
                routeTrips[baseRouteName].push({
                    routeName: route.name,
                    headsign: trip.headsign,
                    stopsSequence: trip.stops_sequence,
                    times: trip.times,
                    serviceDays: service.days
                });
            }
        }
    }

    // For each route, check if we can form a loop
    for (const [routeName, trips] of Object.entries(routeTrips)) {
        // Find trip containing origin
        const originTrip = trips.find(t => t.stopsSequence.includes(originStopId));
        if (!originTrip) continue;

        const originIdx = originTrip.stopsSequence.indexOf(originStopId);

        // Check if destination is AFTER origin in the same trip (already handled by findDirectRoutes)
        // So here we only look for destination in OTHER trips of the same route

        for (const destTrip of trips) {
            if (destTrip.headsign === originTrip.headsign) continue; // Skip same trip

            const destIdx = destTrip.stopsSequence.indexOf(destStopId);
            if (destIdx === -1) continue;

            // Found a loop! Origin is on one trip, destination on another.
            // The bus travels: origin -> end of originTrip -> start of destTrip -> destination

            // Calculate the combined sequence for visualization
            const remainingOriginStops = originTrip.stopsSequence.slice(originIdx);
            const stopsToDestination = destTrip.stopsSequence.slice(0, destIdx + 1);
            const combinedSequence = [...remainingOriginStops, ...stopsToDestination];

            loopRoutes.push({
                routeName: routeName,
                headsign: `${originTrip.headsign} → ${destTrip.headsign}`,
                isLoop: true,
                originTrip: originTrip,
                destTrip: destTrip,
                originStopIndex: originIdx,
                destStopIndex: destIdx,
                stopsSequence: combinedSequence,
                times: originTrip.times, // Use origin trip's times
                serviceDays: originTrip.serviceDays,
                // For display
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
 * First leg: origin -> transfer, Second leg: transfer -> destination
 * @param {string} transferStopId - Optional, defaults to CP
 */
function findTransferRoutes(originStopId, destStopId, transferStopId = CP_STOP_ID) {
    // Find routes from origin to transfer point
    const toTransfer = findDirectRoutes(originStopId, transferStopId);
    // Find routes from transfer point to destination
    const fromTransfer = findDirectRoutes(transferStopId, destStopId);

    if (toTransfer.length === 0 || fromTransfer.length === 0) {
        return null;
    }

    return {
        type: 'TRANSFER',
        transferStop: getStopById(transferStopId),
        firstLeg: toTransfer,
        secondLeg: fromTransfer
    };
}

/**
 * Get current day of week name
 */
function getCurrentDayName(dayOverride = null) {
    if (dayOverride) return dayOverride.toLowerCase();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date().getDay()];
}

/**
 * Check if a route operates on a given day
 */
function routeOperatesOnDay(route, dayName) {
    return route.serviceDays.map(d => d.toLowerCase()).includes(dayName);
}

/**
 * Get the next departure time for a route at a stop after a given time
 * Returns { time, minutesUntil } or null if no more buses today
 */
function getNextDeparture(route, stopIndex, currentTime, dayName) {
    if (!routeOperatesOnDay(route, dayName)) {
        return null;
    }

    const [currentHour, currentMin] = currentTime.split(':').map(Number);
    const currentMinutes = currentHour * 60 + currentMin;

    // Calculate time offset for this stop (assume 2 min per stop)
    const timeOffsetMinutes = stopIndex * 2;

    for (const startTime of route.times) {
        const [h, m] = startTime.split(':').map(Number);
        const arrivalMinutes = h * 60 + m + timeOffsetMinutes;

        // Friday prayer break check (12:40 - 14:00)
        if (dayName === 'friday') {
            const arrivalTime = arrivalMinutes;
            if (arrivalTime >= 12 * 60 + 40 && arrivalTime < 14 * 60) {
                continue;
            }
        }

        if (arrivalMinutes >= currentMinutes) {
            const arrivalHour = Math.floor(arrivalMinutes / 60);
            const arrivalMin = arrivalMinutes % 60;
            return {
                time: `${String(arrivalHour).padStart(2, '0')}:${String(arrivalMin).padStart(2, '0')}`,
                minutesUntil: arrivalMinutes - currentMinutes
            };
        }
    }

    return null; // No more buses today
}

/**
 * Get route geometry key for a specific route and headsign
 */
function getRouteGeometryKey(routeName, headsign) {
    return `${routeName} : ${headsign}`;
}

/**
 * Main function: Get directions from origin to destination
 * 
 * @param {number|null} originLat - Origin latitude (null if using originStopId)
 * @param {number|null} originLon - Origin longitude (null if using originStopId)
 * @param {string|null} originStopId - Origin stop ID (if user selected a stop directly)
 * @param {string} destLocationId - Destination location ID from campus_locations.json
 * @param {string} currentTime - Current time in "HH:MM" format
 * @param {string|null} dayOverride - Optional day override for testing
 */
function getDirections(originLat, originLon, originStopId, destLocationId, currentTime, dayOverride = null, forceBus = false) {
    const dayName = getCurrentDayName(dayOverride);

    // 1. Get destination location and its nearest stop
    const destLocation = getLocationById(destLocationId);
    if (!destLocation) {
        return { error: 'Destination not found', suggestion: 'Please select a valid campus location.' };
    }

    const destStopId = destLocation.nearestStop;
    const destStop = getStopById(destStopId);
    if (!destStop) {
        return { error: 'Destination stop not found', suggestion: 'This location may not be accessible by bus.' };
    }

    // 2. Determine origin coordinates and nearest stops
    let originCoords;
    let userNearestStops;

    if (originStopId) {
        // User selected a specific stop as origin
        const originStop = getStopById(originStopId);
        if (!originStop) {
            return { error: 'Origin stop not found' };
        }
        originCoords = { lat: originStop.lat, lon: originStop.lon };
        // Still find nearby stops so we can suggest walking to a better stop if needed
        userNearestStops = findNearestStops(originStop.lat, originStop.lon, 10);
    } else if (originLat !== null && originLon !== null) {
        // User provided GPS coordinates
        originCoords = { lat: originLat, lon: originLon };
        userNearestStops = findNearestStops(originLat, originLon, 5);
    } else {
        return { error: 'No origin provided', suggestion: 'Please enable GPS or select a starting point.' };
    }

    // 3. Calculate direct distance to destination
    const directDistance = haversineDistance(
        originCoords.lat, originCoords.lon,
        destLocation.lat, destLocation.lon
    );

    // 4. Initial Walk Check
    // If destination is very close, suggest walking immediately (unless user forced bus)
    if (!forceBus && directDistance < WALK_ONLY_THRESHOLD_M) {
        // Check for bus option just in case
        const primaryStop = userNearestStops[0];
        const directRoutes = findDirectRoutes(primaryStop.id, destStopId);
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
        return createWalkResponse(originCoords, destLocation, directDistance, userNearestStops[0], destStopId, alternativeBus);
    }

    // 5. Find direct routes from user's nearest stop
    const primaryStop = userNearestStops[0];
    let directRoutes = findDirectRoutes(primaryStop.id, destStopId);

    // Check if the found bus route is inefficient compared to walking
    // If distance is reasonable (< 1000m) AND (Route is Loop OR > 8 stops), prefer walking
    // Skip this check if user explicitly requested bus
    if (!forceBus && directRoutes.length > 0 && directDistance < 1000) {
        const bestRoute = directRoutes[0];
        // Calculate stop count
        const stopCount = bestRoute.isLoop
            ? bestRoute.stopsSequence.length - 1
            : bestRoute.destStopIndex - bestRoute.originStopIndex;

        if (bestRoute.isLoop || stopCount > 8) {
            // Calculate real next departure for the alternative bus suggestion
            const nextDep = getNextDeparture(bestRoute, bestRoute.originStopIndex, currentTime, dayName);
            const altBusInfo = nextDep ? {
                routeName: bestRoute.routeName,
                headsign: bestRoute.headsign,
                nextDeparture: nextDep.time,
                minutesUntil: nextDep.minutesUntil,
                day: dayName
            } : null;

            return createWalkResponse(originCoords, destLocation, directDistance, primaryStop, destStopId, altBusInfo);
        }
    }

    // 6. If no direct route, check for alternative stops within 100m that have direct routes
    let useAlternativeStop = false;
    let alternativeStop = null;

    if (directRoutes.length === 0) {
        for (let i = 1; i < userNearestStops.length; i++) {
            const altStop = userNearestStops[i];
            if (altStop.distance > ALTERNATIVE_STOP_RADIUS_M) break;

            const altRoutes = findDirectRoutes(altStop.id, destStopId);
            if (altRoutes.length > 0) {
                directRoutes = altRoutes;
                alternativeStop = altStop;
                useAlternativeStop = true;
                break;
            }
        }
    }


    // 7. If still no direct route, suggest transfer via common transfer points
    if (directRoutes.length === 0) {
        // Try multiple transfer points, not just CP
        const transferPoints = ['CP', 'KTC', 'AM', 'KRP'];
        let transferRoutes = null;
        let usedTransferPoint = null;

        for (const transferPoint of transferPoints) {
            if (transferPoint === primaryStop.id || transferPoint === destStopId) continue;
            const routes = findTransferRoutes(primaryStop.id, destStopId, transferPoint);
            if (routes) {
                transferRoutes = routes;
                usedTransferPoint = transferPoint;
                break;
            }
        }

        if (!transferRoutes) {
            // Provide more helpful error - check what routes serve each stop
            const originRoutes = getRoutesForStop(primaryStop.id);
            const destRoutes = getRoutesForStop(destStopId);

            const originRouteNames = [...new Set(originRoutes.map(r => r.routeName))];
            const destRouteNames = [...new Set(destRoutes.map(r => r.routeName))];

            return {
                error: 'No route found',
                suggestion: `No bus connection found from ${primaryStop.name} to ${destStop.name}. ` +
                    `This may require taking the opposite direction of a route, which is not currently supported.`,
                debug: {
                    originStop: primaryStop.name,
                    destStop: destStop.name,
                    originServedBy: originRouteNames,
                    destServedBy: destRouteNames
                }
            };
        }

        // Get next departures for first leg - check today first, then future days
        const firstLegRoute = transferRoutes.firstLeg[0];
        let firstLegDeparture = getNextDeparture(firstLegRoute, firstLegRoute.originStopIndex, currentTime, dayName);
        let departureDay = null;

        if (!firstLegDeparture) {
            // No buses today, find next available
            const nextBus = findNextAvailableBusForRoute(firstLegRoute, currentTime, dayName);
            if (nextBus) {
                firstLegDeparture = { time: nextBus.time, minutesUntil: null };
                departureDay = nextBus.day;
            } else {
                return {
                    error: 'No bus service available',
                    suggestion: 'There may be no bus service on this route.'
                };
            }
        }

        // Get next departure for second leg (estimate arrival at CP + wait time)
        const cpArrivalMinutes = firstLegDeparture.minutesUntil + (firstLegRoute.destStopIndex - firstLegRoute.originStopIndex) * 2;
        const cpArrivalTime = addMinutesToTime(currentTime, cpArrivalMinutes);

        const secondLegRoute = transferRoutes.secondLeg[0];
        const secondLegDeparture = getNextDeparture(secondLegRoute, secondLegRoute.originStopIndex, cpArrivalTime, dayName);

        const walkToOriginStop = haversineDistance(
            originCoords.lat, originCoords.lon,
            primaryStop.lat, primaryStop.lon
        );
        const walkFromDestStop = haversineDistance(
            destStop.lat, destStop.lon,
            destLocation.lat, destLocation.lon
        );

        const transferStopObj = getStopById(usedTransferPoint);

        return {
            type: 'TRANSFER',
            destination: destLocation,
            transferPointId: usedTransferPoint,
            summary: {
                route: `${firstLegRoute.routeName} → ${secondLegRoute.routeName}`,
                departure: firstLegDeparture.time,
                transferAt: transferStopObj.name,
                departureDay: departureDay
            },
            steps: [
                {
                    type: 'walk',
                    instruction: `Walk to ${primaryStop.name}`,
                    from: originCoords,
                    to: { lat: primaryStop.lat, lon: primaryStop.lon },
                    distance: Math.round(walkToOriginStop),
                    duration: Math.ceil(walkToOriginStop / WALKING_SPEED_MPS / 60)
                },
                {
                    type: 'board',
                    instruction: `Board ${firstLegRoute.routeName} (${firstLegRoute.headsign})`,
                    stopName: primaryStop.name,
                    stopId: primaryStop.id,
                    time: firstLegDeparture.time,
                    routeGeometryKey: getRouteGeometryKey(firstLegRoute.routeName, firstLegRoute.headsign)
                },
                {
                    type: 'alight',
                    instruction: `Alight at ${transferStopObj.name}`,
                    stopName: transferStopObj.name,
                    stopId: usedTransferPoint
                },
                {
                    type: 'board',
                    instruction: `Transfer to ${secondLegRoute.routeName} (${secondLegRoute.headsign})`,
                    stopName: transferStopObj.name,
                    stopId: usedTransferPoint,
                    time: secondLegDeparture ? secondLegDeparture.time : 'Next available',
                    routeGeometryKey: getRouteGeometryKey(secondLegRoute.routeName, secondLegRoute.headsign)
                },
                {
                    type: 'alight',
                    instruction: `Alight at ${destStop.name}`,
                    stopName: destStop.name,
                    stopId: destStopId
                },
                {
                    type: 'walk',
                    instruction: `Walk to ${destLocation.name}`,
                    from: { lat: destStop.lat, lon: destStop.lon },
                    to: { lat: destLocation.lat, lon: destLocation.lon },
                    distance: Math.round(walkFromDestStop),
                    duration: Math.ceil(walkFromDestStop / WALKING_SPEED_MPS / 60)
                }
            ],
            totalWalkingDistance: Math.round(walkToOriginStop + walkFromDestStop),
            directWalkDistance: Math.round(directDistance),
            routeGeometries: {
                firstLeg: routeGeometries[getRouteGeometryKey(firstLegRoute.routeName, firstLegRoute.headsign)],
                secondLeg: routeGeometries[getRouteGeometryKey(secondLegRoute.routeName, secondLegRoute.headsign)]
            },
            originStop: primaryStop,
            destStop
        };
    }

    // 8. Direct route found - build directions
    const bestRoute = directRoutes[0];
    let departure = getNextDeparture(bestRoute, bestRoute.originStopIndex, currentTime, dayName);
    let departureDay = null;

    if (!departure) {
        // No buses today, find next available
        const nextBus = findNextAvailableBusForRoute(bestRoute, currentTime, dayName);
        if (nextBus) {
            departure = { time: nextBus.time, minutesUntil: null };
            departureDay = nextBus.day;
        } else {
            return {
                error: 'No bus service available',
                suggestion: 'There may be no bus service on this route.'
            };
        }
    }

    const originStop = useAlternativeStop ? alternativeStop : primaryStop;
    const walkToOriginStop = haversineDistance(
        originCoords.lat, originCoords.lon,
        originStop.lat, originStop.lon
    );
    const walkFromDestStop = haversineDistance(
        destStop.lat, destStop.lon,
        destLocation.lat, destLocation.lon
    );

    // Get upcoming bus times for this route
    const upcomingTimes = getUpcomingDepartures(bestRoute, bestRoute.originStopIndex, currentTime, dayName, 3);

    // Build alternative routes list
    const alternatives = directRoutes.slice(1, 3).map(route => {
        const dep = getNextDeparture(route, route.originStopIndex, currentTime, dayName);
        return dep ? {
            routeName: route.routeName,
            headsign: route.headsign,
            nextDeparture: dep.time
        } : null;
    }).filter(Boolean);

    return {
        type: 'DIRECT',
        destination: destLocation,
        summary: {
            route: bestRoute.routeName,
            headsign: bestRoute.headsign,
            departure: departure.time,
            minutesUntil: departure.minutesUntil,
            departureDay: departureDay // Will be null if today, or day name if future
        },
        steps: [
            {
                type: 'walk',
                instruction: useAlternativeStop
                    ? `Walk to ${originStop.name} (has direct route)`
                    : `Walk to ${originStop.name}`,
                from: originCoords,
                to: { lat: originStop.lat, lon: originStop.lon },
                distance: Math.round(walkToOriginStop),
                duration: Math.ceil(walkToOriginStop / WALKING_SPEED_MPS / 60)
            },
            {
                type: 'board',
                instruction: `Board ${bestRoute.routeName} (${bestRoute.headsign})`,
                stopName: originStop.name,
                stopId: originStop.id,
                time: departure.time,
                upcomingTimes: upcomingTimes.map(t => t.time),
                routeGeometryKey: getRouteGeometryKey(bestRoute.routeName, bestRoute.headsign)
            },
            {
                type: 'ride',
                instruction: bestRoute.isLoop
                    ? `Ride ${bestRoute.stopsSequence.length - 1} stops (via ${bestRoute.loopInfo?.transferPoint || 'loop'})`
                    : `Ride for ${bestRoute.destStopIndex - bestRoute.originStopIndex} stops`,
                stopsCount: bestRoute.isLoop
                    ? bestRoute.stopsSequence.length - 1
                    : bestRoute.destStopIndex - bestRoute.originStopIndex
            },
            {
                type: 'alight',
                instruction: `Alight at ${destStop.name}`,
                stopName: destStop.name,
                stopId: destStopId
            },
            {
                type: 'walk',
                instruction: `Walk to ${destLocation.name}`,
                from: { lat: destStop.lat, lon: destStop.lon },
                to: { lat: destLocation.lat, lon: destLocation.lon },
                distance: Math.round(walkFromDestStop),
                duration: Math.ceil(walkFromDestStop / WALKING_SPEED_MPS / 60)
            }
        ],
        totalWalkingDistance: Math.round(walkToOriginStop + walkFromDestStop),
        directWalkDistance: Math.round(directDistance),
        alternatives,
        // For loop routes, return both leg geometries
        routeGeometry: bestRoute.isLoop
            ? null  // Don't use combined key
            : routeGeometries[getRouteGeometryKey(bestRoute.routeName, bestRoute.headsign)],
        routeGeometries: bestRoute.isLoop
            ? {
                firstLeg: routeGeometries[getRouteGeometryKey(bestRoute.originTrip.routeName, bestRoute.originTrip.headsign)],
                secondLeg: routeGeometries[getRouteGeometryKey(bestRoute.destTrip.routeName, bestRoute.destTrip.headsign)]
            }
            : null,
        isLoopRoute: bestRoute.isLoop || false,
        loopInfo: bestRoute.loopInfo || null,
        originStop,
        destStop
    };
}

/**
 * Helper: Add minutes to a time string
 */
function addMinutesToTime(timeStr, minutes) {
    const [h, m] = timeStr.split(':').map(Number);
    const totalMinutes = h * 60 + m + minutes;
    const newHour = Math.floor(totalMinutes / 60) % 24;
    const newMin = totalMinutes % 60;
    return `${String(newHour).padStart(2, '0')}:${String(newMin).padStart(2, '0')}`;
}

/**
 * Helper: Get multiple upcoming departures
 */
function getUpcomingDepartures(route, stopIndex, currentTime, dayName, count = 3) {
    if (!routeOperatesOnDay(route, dayName)) return [];

    const [currentHour, currentMin] = currentTime.split(':').map(Number);
    const currentMinutes = currentHour * 60 + currentMin;
    const timeOffsetMinutes = stopIndex * 2;
    const results = [];

    for (const startTime of route.times) {
        if (results.length >= count) break;

        const [h, m] = startTime.split(':').map(Number);
        const arrivalMinutes = h * 60 + m + timeOffsetMinutes;

        if (dayName === 'friday' && arrivalMinutes >= 12 * 60 + 40 && arrivalMinutes < 14 * 60) {
            continue;
        }

        if (arrivalMinutes >= currentMinutes) {
            const arrivalHour = Math.floor(arrivalMinutes / 60);
            const arrivalMin = arrivalMinutes % 60;
            results.push({
                time: `${String(arrivalHour).padStart(2, '0')}:${String(arrivalMin).padStart(2, '0')}`,
                minutesUntil: arrivalMinutes - currentMinutes
            });
        }
    }

    return results;
}

/**
 * Helper: Find next available bus (for when no buses today)
 */
function findNextAvailableBus(routes, currentTime, currentDay) {
    // Check next day
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayIndex = days.indexOf(currentDay);

    for (let offset = 1; offset <= 7; offset++) {
        const nextDayIndex = (currentDayIndex + offset) % 7;
        const nextDay = days[nextDayIndex];

        for (const route of routes) {
            if (routeOperatesOnDay(route, nextDay)) {
                const dep = getNextDeparture(route, route.originStopIndex, '00:00', nextDay);
                if (dep) {
                    return {
                        routeName: route.routeName,
                        headsign: route.headsign,
                        nextDeparture: dep.time,
                        day: nextDay.charAt(0).toUpperCase() + nextDay.slice(1)
                    };
                }
            }
        }
    }

    return null;
}

/**
 * Helper: Find next available bus for a specific route
 */
function findNextAvailableBusForRoute(route, currentTime, currentDay) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayIndex = days.indexOf(currentDay);

    for (let offset = 1; offset <= 7; offset++) {
        const nextDayIndex = (currentDayIndex + offset) % 7;
        const nextDay = days[nextDayIndex];

        if (routeOperatesOnDay(route, nextDay)) {
            const dep = getNextDeparture(route, route.originStopIndex || 0, '00:00', nextDay);
            if (dep) {
                return {
                    time: dep.time,
                    day: nextDay.charAt(0).toUpperCase() + nextDay.slice(1)
                };
            }
        }
    }

    return null;
}

module.exports = {
    getDirections,
    findNearestStops,
    getRoutesForStop,
    findDirectRoutes,
    findTransferRoutes,
    haversineDistance,
    getStopById,
    getLocationById
};
