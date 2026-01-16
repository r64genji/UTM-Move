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
    // Note: step.duration is already in minutes (converted in walkingService.js)
    const walkToDuration = walkingToOriginDetails
        ? Math.ceil(walkingToOriginDetails.reduce((acc, step) => acc + step.duration, 0))
        : getWalkingMinutes(walkToOrigin);

    const walkFromDuration = walkingFromDestDetails
        ? Math.ceil(walkingFromDestDetails.reduce((acc, step) => acc + step.duration, 0))
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
        ? route.stopsSequence.length - 1
        : route.destStopIndex - route.originStopIndex;

    const upcomingTimes = getUpcomingDepartures(route, route.originStopIndex, currentTime, dayName, 3);

    const steps = [
        {
            type: 'walk',
            instruction: `Walk to ${originStop.name}`,
            from: originCoords,
            to: { lat: originStop.lat, lon: originStop.lon },
            distance: Math.round(walkToOrigin),
            duration: walkToDuration,
            details: walkingToOriginDetails,
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
            duration: Math.round((timeToMinutes(busArrivalTime) - timeToMinutes(departure.time) + 1440) % 1440)
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
            distance: Math.round(walkFromDest),
            duration: walkFromDuration,
            details: walkingFromDestDetails,
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
        totalWalkingDistance: Math.round(walkToOrigin + walkFromDest),
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
 * Build a transfer route response
 * @param {Object} params - Transfer parameters
 * @returns {Object} TRANSFER response
 */
/**
 * Build a multi-leg transfer response
 * @param {Object} params - Transfer parameters
 * @returns {Object} TRANSFER response
 */
function buildTransferResponse({
    busLegs, // Array of { route, departure, arrivalTime }
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

    const walkToDuration = walkingToOriginDetails
        ? Math.ceil(walkingToOriginDetails.reduce((acc, step) => acc + step.duration, 0))
        : getWalkingMinutes(walkToOrigin);

    const walkFromDuration = walkingFromDestDetails
        ? Math.ceil(walkingFromDestDetails.reduce((acc, step) => acc + step.duration, 0))
        : getWalkingMinutes(walkFromDest);

    const steps = [];

    // 1. Initial Walk
    steps.push({
        type: 'walk',
        instruction: `Walk to ${originStop.name}`,
        from: originCoords,
        to: { lat: originStop.lat, lon: originStop.lon },
        distance: Math.round(walkToOrigin),
        duration: walkToDuration,
        details: walkingToOriginDetails,
        expanded: false
    });

    // 2. Bus Legs and Transfers
    busLegs.forEach((leg, index) => {
        const { route, departure, arrivalTime } = leg;

        const stopCount = route.isLoop
            ? route.stopsSequence.length - 1
            : route.destStopIndex - route.originStopIndex;

        // Boarding step
        steps.push({
            type: index === 0 ? 'board' : 'transfer',
            instruction: index === 0
                ? `Board ${route.routeName} (${route.headsign})`
                : `Transfer to ${route.routeName} (${route.headsign})`,
            stopName: route.fromStopName || (index === 0 ? originStop.name : busLegs[index - 1].toStopName),
            stopId: route.fromStopId || (index === 0 ? originStop.id : busLegs[index - 1].toStopId),
            time: departure.time,
            routeGeometryKey: getRouteGeometryKey(route.routeName, route.headsign)
        });

        // Ride step
        steps.push({
            type: 'ride',
            instruction: `Ride ${stopCount} stops to ${route.toStopName || (index === busLegs.length - 1 ? destStop.name : 'transfer point')}`,
            duration: Math.round((timeToMinutes(arrivalTime) - timeToMinutes(departure.time) + 1440) % 1440)
        });

        // Alight step (only if not transferring immediately)
        if (index === busLegs.length - 1) {
            steps.push({
                type: 'alight',
                instruction: `Alight at ${destStop.name}`,
                stopName: destStop.name,
                stopId: destStop.id,
                time: arrivalTime
            });
        }
    });

    // 3. Final Walk
    steps.push({
        type: 'walk',
        instruction: `Walk to ${destLocation.name}`,
        from: { lat: destStop.lat, lon: destStop.lon },
        to: destLocation,
        distance: Math.round(walkFromDest),
        duration: walkFromDuration,
        details: walkingFromDestDetails,
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
        totalWalkingDistance: Math.round(walkToOrigin + walkFromDest),
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
                fromStop: { lat: route.fromStopLat, lon: route.fromStopLon },
                toStop: { lat: route.toStopLat, lon: route.toStopLon }
            };

            if (route.isLoop && route.headsign.includes('→')) {
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
