/**
 * responseBuilder.js - Direction response object construction
 * Builds WALK_ONLY, DIRECT, BUS_ROUTE, and TRANSFER response objects
 */

const { haversineDistance } = require('../utils/geo');
const { getRouteGeometries } = require('./dataLoader');
const { getDynamicOffset, addMinutesToTime, getUpcomingDepartures, timeToMinutes } = require('./scheduler');
const { getWalkingMinutes, getBusTravelMinutes } = require('./routingEngine');

/**
 * Get route geometry key
 * @param {string} routeName - Route name
 * @param {string} headsign - Trip headsign
 * @returns {string} Geometry key
 */
function getRouteGeometryKey(routeName, headsign) {
    return `${routeName} : ${headsign}`;
}

/**
 * Build a walk-only response with step-by-step directions
 * @param {Object} originCoords - Origin coordinates
 * @param {Object} destLocation - Destination location
 * @param {number} distance - Walking distance in meters
 * @param {Object|null} alternativeBus - Optional bus alternative
 * @param {Object|null} walkingDetails - ORS walking directions with steps
 * @param {Object|null} originName - Optional origin name
 * @returns {Object} WALK_ONLY response
 */
function buildWalkResponse(originCoords, destLocation, distance, alternativeBus = null, walkingDetails = null, originName = null) {
    const walkDuration = walkingDetails?.duration || getWalkingMinutes(distance);
    const actualDistance = walkingDetails?.distance || Math.round(distance);
    const ascent = walkingDetails?.ascent || 0;
    const descent = walkingDetails?.descent || 0;

    // Format walking steps if available
    const walkingSteps = walkingDetails?.steps?.map((step, index) => ({
        stepNumber: index + 1,
        instruction: step.instruction,
        distance: step.distance,
        duration: step.duration,
        type: step.type
    })) || [];

    return {
        type: 'WALK_ONLY',
        origin: {
            name: originName || 'Your Location',
            lat: originCoords.lat,
            lon: originCoords.lon
        },
        message: alternativeBus?.warning
            ? `No buses available at this time. Passable by walking (${actualDistance}m).`
            : actualDistance < 100
                ? 'Your destination is right here!'
                : actualDistance < 300
                    ? 'Your destination is very close.'
                    : `Walk ${actualDistance}m to your destination.`,
        destination: destLocation,
        // Add summary for consistent frontend handling
        summary: {
            totalDuration: walkDuration,
            route: null,
            headsign: null
        },
        // Walk step for metrics display
        steps: [{
            type: 'walk',
            instruction: `Walk to ${destLocation.name}`,
            distance: actualDistance,
            duration: walkDuration,
            ascent: ascent,
            descent: descent,
            from: originCoords,
            to: { lat: destLocation.lat, lon: destLocation.lon }
        }],
        totalWalkingDistance: actualDistance,
        totalDuration: walkDuration,
        alternativeBus,
        walkingRoute: {
            from: originCoords,
            to: { lat: destLocation.lat, lon: destLocation.lon }
        },
        walkingSteps,
        hasDetailedDirections: walkingSteps.length > 0
    };
}

/**
 * Build a direct route response
 * @param {Object} params - Route parameters
 * @returns {Object} DIRECT response
 */
function buildDirectResponse({
    route,
    departure,
    originCoords,
    originStop,
    destStop,
    destLocation,
    directDistance,
    currentTime,
    dayName,
    departureDay,
    walkingToOriginDetails = null,
    walkingFromDestDetails = null,
    originName = null
}) {
    const routeGeometries = getRouteGeometries();

    const walkToOrigin = haversineDistance(originCoords.lat, originCoords.lon, originStop.lat, originStop.lon);
    const walkFromDest = haversineDistance(destStop.lat, destStop.lon, destLocation.lat, destLocation.lon);

    // Use precise duration if details available, otherwise estimate
    // Note: walkingDetails is an object with { distance, duration, steps, ascent, descent }
    const walkToDuration = walkingToOriginDetails?.duration
        ? Math.ceil(walkingToOriginDetails.duration)
        : getWalkingMinutes(walkToOrigin);

    const walkFromDuration = walkingFromDestDetails?.duration
        ? Math.ceil(walkingFromDestDetails.duration)
        : getWalkingMinutes(walkFromDest);

    // Calculate arrival time
    let busArrivalTime = null;
    let totalDuration = 0;
    let eta = null;

    if (departure.tripStartTime) {
        const destOffset = getDynamicOffset(route.routeName, route.headsign, route.destStopIndex);
        const [h, m] = departure.tripStartTime.split(':').map(Number);
        let arrivalMinutes = h * 60 + m + destOffset;

        const arrH = Math.floor(arrivalMinutes / 60) % 24;
        const arrM = arrivalMinutes % 60;
        busArrivalTime = `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`;

        const currentMins = timeToMinutes(currentTime);
        const arrivalAtFinalMins = arrivalMinutes + walkFromDuration;
        let diff = arrivalAtFinalMins - currentMins;
        if (diff < 0) diff += 24 * 60;
        totalDuration = diff;

        const etaH = Math.floor(arrivalAtFinalMins / 60) % 24;
        const etaM = arrivalAtFinalMins % 60;
        eta = `${String(etaH).padStart(2, '0')}:${String(etaM).padStart(2, '0')}`;
    }

    const stopCount = route.isLoop
        ? (route.stopsSequence || []).length - 1
        : Math.max(0, (route.destStopIndex || 0) - (route.originStopIndex || 0));

    const upcomingTimes = getUpcomingDepartures(route, route.originStopIndex, currentTime, dayName, 3);

    const steps = [
        {
            type: 'walk',
            instruction: `Walk to ${originStop.name}`,
            from: originCoords,
            to: { lat: originStop.lat, lon: originStop.lon },
            distance: walkingToOriginDetails?.distance || Math.round(walkToOrigin),
            duration: walkToDuration,
            ascent: walkingToOriginDetails?.ascent || 0,
            descent: walkingToOriginDetails?.descent || 0,
            details: walkingToOriginDetails?.steps,
            expanded: false
        },
        {
            type: 'board',
            instruction: `Board ${route.routeName} (${route.headsign})`,
            stopName: originStop.name,
            stopId: originStop.id,
            time: departure.time,
            upcomingTimes: upcomingTimes.map(t => t.time),
            routeGeometryKey: getRouteGeometryKey(route.routeName, route.headsign)
        },
        {
            type: 'ride',
            instruction: `Ride ${stopCount} stops to ${destStop.name}`,
            duration: busArrivalTime
                ? Math.round((timeToMinutes(busArrivalTime) - timeToMinutes(departure.time) + 1440) % 1440)
                : 0
        },
        {
            type: 'alight',
            instruction: `Alight at ${destStop.name}`,
            stopName: destStop.name,
            stopId: destStop.id,
            time: busArrivalTime
        },
        {
            type: 'walk',
            instruction: `Walk to ${destLocation.name}`,
            from: { lat: destStop.lat, lon: destStop.lon },
            to: destLocation,
            distance: walkingFromDestDetails?.distance || Math.round(walkFromDest),
            duration: walkFromDuration,
            ascent: walkingFromDestDetails?.ascent || 0,
            descent: walkingFromDestDetails?.descent || 0,
            details: walkingFromDestDetails?.steps,
            expanded: false
        }
    ];

    // Get route geometry
    const geometryKey = getRouteGeometryKey(route.routeName, route.headsign);

    return {
        type: 'DIRECT',
        origin: {
            name: originName || originStop.name, // Use specific origin name if provided (e.g. M19)
            lat: originCoords.lat,
            lon: originCoords.lon
        },
        destination: destLocation,
        summary: {
            route: route.routeName,
            headsign: route.headsign,
            departure: departure.time,
            minutesUntil: departure.minutesUntil,
            departureDay,
            busArrivalTime,
            totalDuration,
            eta
        },
        steps,
        totalWalkingDistance: Math.round((walkingToOriginDetails?.distance || walkToOrigin) + (walkingFromDestDetails?.distance || walkFromDest)),
        directWalkDistance: Math.round(directDistance),
        routeGeometry: route.isLoop ? null : routeGeometries[geometryKey],
        routeGeometries: route.isLoop ? {
            firstLeg: routeGeometries[getRouteGeometryKey(route.originTrip.routeName, route.originTrip.headsign)],
            secondLeg: routeGeometries[getRouteGeometryKey(route.destTrip.routeName, route.destTrip.headsign)]
        } : null,
        isLoopRoute: route.isLoop || false,
        loopInfo: route.loopInfo || null,
        originStop,
        destStop
    };
}

/**
 * Build a multi-leg transfer response
 * @param {Object} params - Transfer parameters
 * @returns {Object} TRANSFER response
 */
function buildTransferResponse({
    busLegs, // Array of { route, departure, arrivalTime }
    transferWalks = [], // Array of { afterBusLegIndex, from, to, distance, duration }
    originCoords,
    originStop,
    destStop,
    destLocation,
    directDistance,
    currentTime,
    departureDay,
    walkingToOriginDetails = null,
    walkingFromDestDetails = null,
    originName = null
}) {
    const routeGeometries = getRouteGeometries();
    const walkToOrigin = haversineDistance(originCoords.lat, originCoords.lon, originStop.lat, originStop.lon);
    const walkFromDest = haversineDistance(destStop.lat, destStop.lon, destLocation.lat, destLocation.lon);

    const walkToDuration = walkingToOriginDetails?.duration
        ? Math.ceil(walkingToOriginDetails.duration)
        : getWalkingMinutes(walkToOrigin);

    const walkFromDuration = walkingFromDestDetails?.duration
        ? Math.ceil(walkingFromDestDetails.duration)
        : getWalkingMinutes(walkFromDest);

    const steps = [];

    // 1. Initial Walk
    steps.push({
        type: 'walk',
        instruction: `Walk to ${originStop.name}`,
        from: originCoords,
        to: { lat: originStop.lat, lon: originStop.lon },
        distance: walkingToOriginDetails?.distance || Math.round(walkToOrigin),
        duration: walkToDuration,
        ascent: walkingToOriginDetails?.ascent || 0,
        descent: walkingToOriginDetails?.descent || 0,
        details: walkingToOriginDetails?.steps,
        expanded: false
    });

    // 2. Bus Legs and Transfers
    let totalTransferWalkDistance = 0;

    busLegs.forEach((leg, index) => {
        const { route, departure, arrivalTime } = leg;

        const stopCount = route.isLoop
            ? (route.stopsSequence || []).length - 1
            : Math.max(0, (route.destStopIndex || 0) - (route.originStopIndex || 0));

        // Boarding step
        steps.push({
            type: index === 0 ? 'board' : 'transfer',
            instruction: index === 0
                ? `Board ${route.routeName} (${route.headsign})`
                : `Transfer to ${route.routeName} (${route.headsign})`,
            stopName: route.fromStopName || (index === 0 ? originStop.name : busLegs[index - 1].route.toStopName),
            stopId: route.fromStopId || (index === 0 ? originStop.id : busLegs[index - 1].route.toStopId),
            time: departure.time,
            routeGeometryKey: getRouteGeometryKey(route.routeName, route.headsign)
        });

        // Ride step
        steps.push({
            type: 'ride',
            instruction: `Ride ${stopCount} stops to ${route.toStopName || (index === busLegs.length - 1 ? destStop.name : 'transfer point')}`,
            duration: Math.round((timeToMinutes(arrivalTime) - timeToMinutes(departure.time) + 1440) % 1440)
        });

        // Alight step
        const isLastLeg = index === busLegs.length - 1;
        const alightStop = isLastLeg ? destStop : {
            name: route.toStopName,
            id: route.toStopId,
            lat: route.toStopLat,
            lon: route.toStopLon
        };

        steps.push({
            type: 'alight',
            instruction: `Alight at ${alightStop.name}`,
            stopName: alightStop.name,
            stopId: alightStop.id,
            time: arrivalTime
        });

        // If not the last leg, check for transfer walk
        if (!isLastLeg) {
            // Find transfer walk for this leg
            const transferWalk = transferWalks.find(tw => tw.afterBusLegIndex === index);
            if (transferWalk && transferWalk.distance > 10) {
                // Add transfer walk step if there's significant walking
                steps.push({
                    type: 'walk',
                    instruction: `Walk to ${busLegs[index + 1].route.fromStopName || 'next stop'}`,
                    from: { lat: transferWalk.from.lat, lon: transferWalk.from.lon },
                    to: { lat: transferWalk.to.lat, lon: transferWalk.to.lon },
                    distance: Math.round(transferWalk.distance),
                    duration: Math.ceil(transferWalk.duration),
                    ascent: 0,
                    descent: 0,
                    details: null,
                    expanded: false,
                    isTransferWalk: true  // Flag for frontend to identify transfer walks
                });
                totalTransferWalkDistance += transferWalk.distance;
            }
        }
    });

    // 3. Final Walk
    steps.push({
        type: 'walk',
        instruction: `Walk to ${destLocation.name}`,
        from: { lat: destStop.lat, lon: destStop.lon },
        to: destLocation,
        distance: walkingFromDestDetails?.distance || Math.round(walkFromDest),
        duration: walkFromDuration,
        ascent: walkingFromDestDetails?.ascent || 0,
        descent: walkingFromDestDetails?.descent || 0,
        details: walkingFromDestDetails?.steps,
        expanded: false
    });

    const firstLeg = busLegs[0];
    const lastLeg = busLegs[busLegs.length - 1];

    // Calculate total duration
    const currentMins = timeToMinutes(currentTime);
    const finalArrivalMins = timeToMinutes(lastLeg.arrivalTime);
    let diff = finalArrivalMins - currentMins;
    if (diff < 0) diff += 24 * 60;
    const totalDuration = diff + walkFromDuration;

    return {
        type: 'TRANSFER',
        origin: {
            name: originName || originStop.name,
            lat: originCoords.lat,
            lon: originCoords.lon
        },
        destination: destLocation,
        originStop,
        summary: {
            route: busLegs.map(l => l.route.routeName).join(' → '),
            headsign: busLegs.map(l => l.route.headsign).join(' → '),
            departure: firstLeg.departure.time,
            departureDay,
            totalDuration,
            busArrivalTime: lastLeg.arrivalTime,
            eta: addMinutesToTime(lastLeg.arrivalTime, walkFromDuration)
        },
        steps,
        totalWalkingDistance: Math.round((walkingToOriginDetails?.distance || walkToOrigin) + (walkingFromDestDetails?.distance || walkFromDest) + totalTransferWalkDistance),
        directWalkDistance: Math.round(directDistance),
        // backward compatibility for simple consumers
        firstLeg: firstLeg.route,
        secondLeg: lastLeg.route,

        // Comprehensive geometries for the map
        routeGeometries: busLegs.map(leg => {
            const { route } = leg;
            const res = {
                routeName: route.routeName,
                headsign: route.headsign,
                isLoop: false,
                isMergedLeg: route.isMergedLeg || false,
                fromStop: { lat: route.fromStopLat, lon: route.fromStopLon },
                toStop: { lat: route.toStopLat, lon: route.toStopLon }
            };

            // Handle merged legs (same route, continuous ride through headsign change)
            if (route.isMergedLeg && route.headsign.includes('→')) {
                const parts = route.headsign.split('→');
                res.isMergedLeg = true;
                res.first = routeGeometries[getRouteGeometryKey(route.routeName, parts[0].trim())];
                res.second = routeGeometries[getRouteGeometryKey(route.routeName, parts[1].trim())];
            } else if (route.isLoop && route.headsign.includes('→')) {
                const parts = route.headsign.split('→');
                res.isLoop = true;
                res.first = routeGeometries[getRouteGeometryKey(route.routeName, parts[0].trim())];
                res.second = routeGeometries[getRouteGeometryKey(route.routeName, parts[1].trim())];
            } else {
                res.geometry = routeGeometries[getRouteGeometryKey(route.routeName, route.headsign)];
            }
            return res;
        }),
        destStop
    };
}

module.exports = {
    getRouteGeometryKey,
    buildWalkResponse,
    buildDirectResponse,
    buildTransferResponse
};
