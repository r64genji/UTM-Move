/**
 * responseBuilder.js - Direction response object construction
 * Builds WALK_ONLY, DIRECT, BUS_ROUTE, and TRANSFER response objects
 */

const { haversineDistance } = require('../utils/geo');
const { getRouteGeometries } = require('./dataLoader');
const { getDynamicOffset, addMinutesToTime, getUpcomingDepartures, timeToMinutes } = require('./scheduler');
const { WALKING_SPEED_MPS, getWalkingMinutes, getBusTravelMinutes } = require('./routeScorer');

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
        message: actualDistance < 100
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
    walkingFromDestDetails = null
}) {
    const routeGeometries = getRouteGeometries();

    const walkToOrigin = haversineDistance(originCoords.lat, originCoords.lon, originStop.lat, originStop.lon);
    const walkFromDest = haversineDistance(destStop.lat, destStop.lon, destLocation.lat, destLocation.lon);

    // Use precise duration if details available, otherwise estimate
    const walkToDuration = walkingToOriginDetails
        ? Math.ceil(walkingToOriginDetails.reduce((acc, step) => acc + step.duration, 0) / 60)
        : getWalkingMinutes(walkToOrigin);

    const walkFromDuration = walkingFromDestDetails
        ? Math.ceil(walkingFromDestDetails.reduce((acc, step) => acc + step.duration, 0) / 60)
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
            name: originStop.name,
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
function buildTransferResponse({
    firstLeg,
    secondLeg,
    transferStop,
    transferPointId,
    firstDeparture,
    secondDeparture,
    originCoords,
    originStop,
    destStop,
    destLocation,
    directDistance,
    currentTime,
    departureDay,
    walkingToOriginDetails = null,
    walkingFromDestDetails = null
}) {
    const routeGeometries = getRouteGeometries();

    const walkToOrigin = haversineDistance(originCoords.lat, originCoords.lon, originStop.lat, originStop.lon);
    const walkFromDest = haversineDistance(destStop.lat, destStop.lon, destLocation.lat, destLocation.lon);

    const walkToDuration = walkingToOriginDetails
        ? Math.ceil(walkingToOriginDetails.reduce((acc, step) => acc + step.duration, 0) / 60)
        : getWalkingMinutes(walkToOrigin);

    const walkFromDuration = walkingFromDestDetails
        ? Math.ceil(walkingFromDestDetails.reduce((acc, step) => acc + step.duration, 0) / 60)
        : getWalkingMinutes(walkFromDest);

    const firstLegOffset = getDynamicOffset(firstLeg.routeName, firstLeg.headsign, firstLeg.destStopIndex);
    const firstLegArrivalTime = addMinutesToTime(firstDeparture.tripStartTime, firstLegOffset);

    const secondLegOffset = getDynamicOffset(secondLeg.routeName, secondLeg.headsign, secondLeg.destStopIndex);
    const secondLegArrivalTime = secondDeparture
        ? addMinutesToTime(secondDeparture.tripStartTime, secondLegOffset)
        : null;

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
            instruction: `Board ${firstLeg.routeName} (${firstLeg.headsign})`,
            stopName: originStop.name,
            stopId: originStop.id,
            time: firstDeparture.time,
            routeGeometryKey: getRouteGeometryKey(firstLeg.routeName, firstLeg.headsign)
        },
        {
            type: 'alight',
            instruction: `Alight at ${transferStop.name}`,
            stopName: transferStop.name,
            stopId: transferPointId,
            time: firstLegArrivalTime
        },
        // Only add transfer walk if significant distance/transfer logic requires it (usually 0 for same stop transfer)
        // For simplicity we assume same stop transfer for now unless separated
        {
            type: 'board',
            instruction: `Transfer to ${secondLeg.routeName} (${secondLeg.headsign})`,
            stopName: transferStop.name,
            stopId: transferPointId,
            time: secondDeparture ? secondDeparture.time : 'Wait...',
            routeGeometryKey: getRouteGeometryKey(secondLeg.routeName, secondLeg.headsign)
        },
        {
            type: 'alight',
            instruction: `Alight at ${destStop.name}`,
            stopName: destStop.name,
            stopId: destStop.id,
            time: secondLegArrivalTime
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

    // Calculate total duration
    let totalDuration = null;
    if (secondDeparture && secondLegArrivalTime) {
        const currentMins = timeToMinutes(currentTime);
        const arrivalMins = timeToMinutes(secondLegArrivalTime);
        let diff = arrivalMins - currentMins;
        if (diff < 0) diff += 24 * 60;
        totalDuration = diff + walkFromDuration;
    }

    return {
        type: 'TRANSFER',
        origin: {
            name: originStop.name,
            lat: originCoords.lat,
            lon: originCoords.lon
        },
        destination: destLocation,
        originStop,
        transferPointId,
        summary: {
            route: `${firstLeg.routeName} → ${secondLeg.routeName}`,
            headsign: `${firstLeg.headsign} → ${secondLeg.headsign}`,
            departure: firstDeparture.time,
            transferAt: transferStop.name,
            departureDay,
            totalDuration,
            busArrivalTime: secondLegArrivalTime,
            eta: secondLegArrivalTime ? addMinutesToTime(secondLegArrivalTime, walkFromDuration) : null
        },
        steps,
        totalWalkingDistance: Math.round(walkToOrigin + walkFromDest),
        directWalkDistance: Math.round(directDistance),
        routeGeometries: (() => {
            // Handle loop routes that have concatenated headsigns like "To X → To Y"
            // For loop routes, we need BOTH geometries to show the full path
            const getGeometriesForLeg = (leg) => {
                if (leg.isLoop && leg.headsign.includes('→')) {
                    // Loop route - return both origin and dest trip geometries
                    const originHeadsign = leg.originTrip?.headsign || leg.headsign.split('→')[0].trim();
                    const destHeadsign = leg.destTrip?.headsign || leg.headsign.split('→')[1]?.trim();

                    const originKey = getRouteGeometryKey(leg.routeName, originHeadsign);
                    const destKey = getRouteGeometryKey(leg.routeName, destHeadsign);

                    return {
                        isLoop: true,
                        first: routeGeometries[originKey],
                        second: routeGeometries[destKey],
                        originHeadsign,
                        destHeadsign
                    };
                }

                // Regular route - single geometry
                const key = getRouteGeometryKey(leg.routeName, leg.headsign);
                return {
                    isLoop: false,
                    geometry: routeGeometries[key]
                };
            };

            const firstLegGeom = getGeometriesForLeg(firstLeg);
            const secondLegGeom = getGeometriesForLeg(secondLeg);

            console.log('TRANSFER route geometry keys:', {
                firstLegIsLoop: firstLegGeom.isLoop,
                secondLegIsLoop: secondLegGeom.isLoop,
                firstLegHasGeom: firstLegGeom.isLoop ? !!(firstLegGeom.first && firstLegGeom.second) : !!firstLegGeom.geometry,
                secondLegHasGeom: secondLegGeom.isLoop ? !!(secondLegGeom.first && secondLegGeom.second) : !!secondLegGeom.geometry
            });

            // Build result - for loop legs, combine both geometries
            return {
                firstLeg: firstLegGeom.isLoop
                    ? (firstLegGeom.first || firstLegGeom.second)
                    : firstLegGeom.geometry,
                secondLeg: secondLegGeom.isLoop
                    ? (secondLegGeom.first || secondLegGeom.second)
                    : secondLegGeom.geometry,
                // Additional info for loop routes
                firstLegParts: firstLegGeom.isLoop ? { first: firstLegGeom.first, second: firstLegGeom.second } : null,
                secondLegParts: secondLegGeom.isLoop ? { first: secondLegGeom.first, second: secondLegGeom.second } : null
            };
        })(),
        destStop
    };
}

module.exports = {
    getRouteGeometryKey,
    buildWalkResponse,
    buildDirectResponse,
    buildTransferResponse
};
