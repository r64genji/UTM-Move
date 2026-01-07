// directionLogic.js
// Core routing algorithm for UTM Move directions feature

const fs = require('fs');
const path = require('path');
const axios = require('axios'); // For OSRM requests

const OSRM_BASE_URL = 'http://router.project-osrm.org/table/v1/walking';


// Load data files
const scheduleData = JSON.parse(fs.readFileSync(path.join(__dirname, 'schedule.json'), 'utf8'));
const campusLocations = JSON.parse(fs.readFileSync(path.join(__dirname, 'campus_locations.json'), 'utf8'));
const routeGeometries = JSON.parse(fs.readFileSync(path.join(__dirname, 'route_geometries.json'), 'utf8'));

// Constants
const WALKING_SPEED_MPS = 1.4; // meters per second (~5 km/h)
const WALK_ONLY_THRESHOLD_M = 200; // If destination within 200m, suggest walking
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
 * Fetch real walking distances from OSRM Table Service
 * @param {number} originLat 
 * @param {number} originLon 
 * @param {Array} destinations - Array of objects with lat, lon
 * @returns {Promise<Array>} - Array of distances in meters (or nulls if failed)
 */
async function getWalkingDistances(originLat, originLon, destinations) {
    if (destinations.length === 0) return [];

    // Format: lon,lat;lon,lat...
    // Source is first (index 0)
    const coordinates = [`${originLon},${originLat}`]
        .concat(destinations.map(d => `${d.lon},${d.lat}`))
        .join(';');

    // We want distances from source (0) to all destinations (1..N)
    const url = `${OSRM_BASE_URL}/${coordinates}?sources=0&annotations=distance`;

    try {
        const response = await axios.get(url);
        if (response.data.code === 'Ok') {
            // distances[0] is the array of distances from source to all destinations
            return response.data.distances[0].slice(1); // Exclude 0->0 distance
        }
    } catch (error) {
        console.warn("OSRM Table fetch failed, falling back to Haversine:", error.message);
    }
    return null; // Fallback indicator
}

/**
 * Find N nearest bus stops to a coordinate
 */
async function findNearestStops(lat, lon, count = 3) {
    // 1. Initial Haversine Filter (Get top candidates to minimize API load)
    const initialCandidates = scheduleData.stops.map(stop => ({
        ...stop,
        distance: haversineDistance(lat, lon, stop.lat, stop.lon)
    }));

    // Sort by straight-line distance first
    initialCandidates.sort((a, b) => a.distance - b.distance);

    // Take top 10 candidates for OSRM refinement (increased from 5 to ensure hubs like CP are checked)
    let candidates = initialCandidates.slice(0, 10);

    // 2. Refine with OSRM
    const osrmDistances = await getWalkingDistances(lat, lon, candidates);

    if (osrmDistances) {
        candidates = candidates.map((stop, index) => ({
            ...stop,
            distance: osrmDistances[index] || stop.distance // Use OSRM if valid, else keep Haversine
        }));
        // Re-sort using OSRM distances
        candidates.sort((a, b) => a.distance - b.distance);
    }

    return candidates.slice(0, count);
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

            // CRITICAL FIX: Ensure trips operate on overlapping days
            // Otherwise we might combine a Weekday trip with a Weekend trip
            const commonDays = originTrip.serviceDays.filter(day =>
                destTrip.serviceDays.includes(day)
            );

            if (commonDays.length === 0) continue;

            // CRITICAL FIX 2: Restrict loops through Terminus (KDOJ)
            // User confirmed that "To KDOJ" implies end of line, cannot loop back to "To Cluster"
            // APPLIES TO ROUTE E ONLY
            if (routeName.includes('Route E') && originTrip.headsign.includes('To KDOJ') && destTrip.headsign.includes('To Cluster')) {
                continue;
            }

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
                serviceDays: commonDays, // Use INTERSECTION of days
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

const routeDurationsPath = path.join(__dirname, 'route_durations.json');
let routeDurations = {};
try {
    if (fs.existsSync(routeDurationsPath)) {
        routeDurations = JSON.parse(fs.readFileSync(routeDurationsPath, 'utf8'));
    }
} catch (e) {
    console.warn("Could not load route_durations.json", e);
}

/**
 * Calculate cumulative time offset in minutes from start of trip to a specific stop index
 */
function getDynamicOffset(routeName, headsign, targetIndex) {
    if (targetIndex === 0) return 0;

    const key = `${routeName}_${headsign}`;
    const data = routeDurations[key];

    if (!data || !data.segments) {
        // Fallback to 2 mins per stop if no data
        return targetIndex * 2;
    }

    let cumulativeSecs = 0;
    // Sum segments up to targetIndex-1
    // segments[0] is stop 0 -> stop 1
    // segments[i] corresponds to travel from stop i to stop i+1
    // To get to stop 2 (index 2), we need seg[0] + seg[1]
    for (let i = 0; i < targetIndex; i++) {
        if (data.segments[i]) {
            cumulativeSecs += data.segments[i].totalSecs;
        }
    }

    return Math.round(cumulativeSecs / 60);
}

/**
 * Get the next departure time for a route at a stop after a given time
 * Returns { time, minutesUntil, tripStartTime }
 */
function getNextDeparture(route, stopIndex, currentTime, dayName) {
    if (!routeOperatesOnDay(route, dayName)) {
        return null;
    }

    const [currentHour, currentMin] = currentTime.split(':').map(Number);
    const currentMinutes = currentHour * 60 + currentMin;

    // Calculate time offset for this stop using dynamic data
    const timeOffsetMinutes = getDynamicOffset(route.routeName, route.headsign, stopIndex);

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
                minutesUntil: arrivalMinutes - currentMinutes,
                tripStartTime: startTime // needed to calculate arrival at dest later
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
async function getDirections(originLat, originLon, originStopId, destLocationId, currentTime, dayOverride = null, forceBus = false) {
    const dayName = getCurrentDayName(dayOverride);

    // 1. Get destination location and its nearest stop
    const destLocation = getLocationById(destLocationId);
    // 2. Determine origin coordinates and nearest stops
    let originCoords;
    let userNearestStops;

    // Optimization: Find nearby destination stops efficiently (No OSRM calls)
    // We want to find the top 3 closest stops to the Destination Location
    let destNearestStops = [];
    if (destLocation) {
        // Calculate distance to ALL stops (fast in memory)
        const candidates = scheduleData.stops.map(s => ({
            ...s,
            dist: haversineDistance(destLocation.lat, destLocation.lon, s.lat, s.lon)
        }));
        candidates.sort((a, b) => a.dist - b.dist);
        destNearestStops = candidates.slice(0, 3);
    }

    if (destNearestStops.length === 0) {
        return { error: 'No bus stops found near destination' };
    }

    // Default closest stop (Legacy/Fallback)
    // Try to use the pre-defined nearestStop from location if available and in top list?
    // Actually the top sorted one is usually the defined one.
    const destStop = destNearestStops[0];
    const destStopId = destStop.id;

    if (originStopId) {
        // User selected a specific stop as origin
        const originStop = getStopById(originStopId);
        if (!originStop) {
            return { error: 'Origin stop not found' };
        }
        originCoords = { lat: originStop.lat, lon: originStop.lon };
        // We still use findNearestStops for ORIGIN because user might be at a random GPS location?
        // But if originStopId is set, we know where they are.
        // The original code passed '10' to findNearestStops for origin.
        // Let's keep origin logic as is (it was fast enough before or user selects stop).
        // If origin is stopId, we don't need OSRM for origin stops.
        userNearestStops = [originStop];
    } else if (originLat !== null && originLon !== null) {
        // User provided GPS coordinates
        originCoords = { lat: originLat, lon: originLon };
        userNearestStops = await findNearestStops(originLat, originLon, 5);
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
    // Optimization: Check ALL nearby destination stops, not just the closest one.
    // This allows finding a stop that is slightly further to walk but saves significant bus time (e.g. avoiding a loop).
    const primaryStop = userNearestStops[0];
    let directRoutes = [];
    let bestDestStop = null;
    let minTotalScore = Infinity; // Score = BusDuration + WalkDuration + WaitTime

    // We iterate through candidate destination stops
    // Limit to top 3 as requested by user
    const candidateDestStops = destNearestStops.slice(0, 3);
    let bestAlternativeBus = null; // for fallback logic

    // DEBUG LOGGING
    // console.log(`[DEBUG] Evaluating ${candidateDestStops.length} candidates for Dest: ${destLocation.name}`);

    for (const candidateDest of candidateDestStops) {
        const routes = findDirectRoutes(primaryStop.id, candidateDest.id);
        if (routes.length === 0) {
            // console.log(`[DEBUG] No direct route to ${candidateDest.id}`);
            continue;
        }

        // Evaluate the best route to this candidate stop
        const route = routes[0];
        let nextDep = getNextDeparture(route, route.originStopIndex, currentTime, dayName);

        // Fix: If no bus today, check next available (Tomorrow) to allow fair comparison with Loop logic
        if (!nextDep) {
            const nextBus = findNextAvailableBusForRoute(route, currentTime, dayName);
            if (nextBus) {
                const currentMins = timeToMinutes(currentTime);
                const nextMins = timeToMinutes(nextBus.time);
                let diff = nextMins - currentMins;
                if (diff < 0) diff += 24 * 60; // Assume next day

                nextDep = {
                    time: nextBus.time,
                    minutesUntil: diff,
                    tripStartTime: nextBus.tripStartTime
                };
            }
        }

        if (!nextDep) {
            // console.log(`[DEBUG] No departure for ${candidateDest.id}`);
            continue; // No bus today OR tomorrow
        }

        // ... calculation ...

        // Calculate costs
        // 1. Walk from Dest Stop to Final Location
        const walkFromDist = haversineDistance(
            candidateDest.lat, candidateDest.lon,
            destLocation.lat, destLocation.lon
        );
        const walkFromMins = Math.ceil(walkFromDist / WALKING_SPEED_MPS / 60);

        // 2. Bus Duration (Boarding -> Alighting)
        // Need dynamic offset from Origin -> Dest
        let busTravelMins = 0;
        if (route.isLoop) {
            // Complex case: Origin on Trip 1, Dest on Trip 2
            // Duration = (End of Trip 1 - Origin) + (Dest - Start of Trip 2)
            const originTrip = route.originTrip;
            const destTrip = route.destTrip;

            const originOff = getDynamicOffset(route.routeName, originTrip.headsign, route.originStopIndex) || 0;
            const trip1EndOff = getDynamicOffset(route.routeName, originTrip.headsign, originTrip.stopsSequence.length - 1) || 0;
            const trip2StartOff = getDynamicOffset(route.routeName, destTrip.headsign, 0) || 0;
            const destOff = getDynamicOffset(route.routeName, destTrip.headsign, route.destStopIndex) || 0;

            busTravelMins = (trip1EndOff - originOff) + (destOff - trip2StartOff);

            // Add dwell time heuristic if needed (e.g. 5 mins buffer between trips)
            busTravelMins += 5;
        } else {
            // Simple Direct Route
            const originOffset = getDynamicOffset(route.routeName, route.headsign, route.originStopIndex) || 0;
            const destOffset = getDynamicOffset(route.routeName, route.headsign, route.destStopIndex) || 0;
            busTravelMins = destOffset - originOffset;
        }

        if (busTravelMins < 0) busTravelMins = 0;

        // 3. Wait Time
        const waitMins = nextDep.minutesUntil;

        // Total Score (Minutes) = Wait + Ride + Walk
        const totalScore = waitMins + busTravelMins + walkFromMins;

        if (totalScore < minTotalScore) {
            minTotalScore = totalScore;
            directRoutes = [route]; // Use this route
            bestDestStop = candidateDest;
        }
    }

    // Update the main destStop variables if we found a better one
    if (bestDestStop && directRoutes.length > 0) {
        directRoutes[0]._actualDestStop = bestDestStop;
    }

    // Now handling the inefficient route logic (Step 5 continued)
    let inefficientDirectRoute = null;

    if (!forceBus && directRoutes.length > 0 && directDistance < 1000) {
        const bestRoute = directRoutes[0];
        const stopCount = bestRoute.isLoop
            ? bestRoute.stopsSequence.length - 1
            : bestRoute.destStopIndex - bestRoute.originStopIndex;

        // If our "Optimized" route is still a loop/inefficient, maybe walking is better.
        if (bestRoute.isLoop || stopCount > 8) {
            inefficientDirectRoute = bestRoute;
            directRoutes = [];
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

    // 6b. If we had an inefficient route, and finding alternatives failed, 
    // NOW return the Walk response (prefer walking over the inefficient route)
    if (directRoutes.length === 0 && inefficientDirectRoute) {
        // Calculate real next departure for the alternative bus suggestion
        const nextDep = getNextDeparture(inefficientDirectRoute, inefficientDirectRoute.originStopIndex, currentTime, dayName);
        const altBusInfo = nextDep ? {
            routeName: inefficientDirectRoute.routeName,
            headsign: inefficientDirectRoute.headsign,
            nextDeparture: nextDep.time,
            minutesUntil: nextDep.minutesUntil,
            day: dayName
        } : null;

        return createWalkResponse(originCoords, destLocation, directDistance, primaryStop, destStopId, altBusInfo);
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
            // CRITICAL FIX: Check alternative stops for transfers
            // If primary stop (e.g., KLG_W) has no transfer, check if nearby stops (e.g., KLG_E) do.
            for (let i = 1; i < userNearestStops.length; i++) {
                const altStop = userNearestStops[i];
                // Limit search radius for alternative transfer starting points (e.g., 300m)
                if (altStop.distance > 300) break;

                for (const transferPoint of transferPoints) {
                    if (transferPoint === altStop.id || transferPoint === destStopId) continue;
                    const routes = findTransferRoutes(altStop.id, destStopId, transferPoint);
                    if (routes) {
                        transferRoutes = routes;
                        usedTransferPoint = transferPoint;
                        useAlternativeStop = true;
                        alternativeStop = altStop;
                        break;
                    }
                }
                if (transferRoutes) break;
            }
        }
        if (!transferRoutes) {
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
                firstLegDeparture = { time: nextBus.time, minutesUntil: null, tripStartTime: nextBus.tripStartTime };
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
        let secondLegDeparture = getNextDeparture(secondLegRoute, secondLegRoute.originStopIndex, cpArrivalTime, dayName);

        // Fix: If no connection today, find next available (likely tomorrow)
        if (!secondLegDeparture) {
            const nextBusLeg2 = findNextAvailableBusForRoute(secondLegRoute, cpArrivalTime, dayName);
            if (nextBusLeg2) {
                secondLegDeparture = { time: nextBusLeg2.time, minutesUntil: null, tripStartTime: nextBusLeg2.tripStartTime };
                // Note: If crossing midnight, duration logic needs to handle day gap.
            }
        }

        // Determine effective origin stop (primary or alternative)
        const effectiveOriginStop = useAlternativeStop ? alternativeStop : primaryStop;

        const walkToOriginStop = haversineDistance(
            originCoords.lat, originCoords.lon,
            effectiveOriginStop.lat, effectiveOriginStop.lon
        );
        const walkFromDestStop = haversineDistance(
            destStop.lat, destStop.lon,
            destLocation.lat, destLocation.lon
        );

        const transferStopObj = getStopById(usedTransferPoint);

        return {
            type: 'TRANSFER',
            destination: destLocation,
            originStop: effectiveOriginStop, // Ensure frontend knows correct origin
            transferPointId: usedTransferPoint,
            summary: {
                route: `${firstLegRoute.routeName} → ${secondLegRoute.routeName}`,
                headsign: `${firstLegRoute.headsign} → ${secondLegRoute.headsign}`,
                departure: firstLegDeparture.time,
                transferAt: transferStopObj.name,
                departureDay: departureDay,
                departureDay: departureDay,
                totalDuration: (function () {
                    if (!secondLegDeparture) return null;

                    const currentMins = timeToMinutes(currentTime);
                    const leg2OriginOff = getDynamicOffset(secondLegRoute.routeName, secondLegRoute.headsign, secondLegRoute.originStopIndex) || 0;
                    const leg2DestOff = getDynamicOffset(secondLegRoute.routeName, secondLegRoute.headsign, secondLegRoute.destStopIndex) || 0;
                    const leg2Duration = Math.max(0, leg2DestOff - leg2OriginOff);

                    const arrivalMins = timeToMinutes(secondLegDeparture.time) + leg2Duration;

                    // Walk times
                    const walkDuration = Math.ceil(walkToOriginStop / WALKING_SPEED_MPS / 60) +
                        Math.ceil(walkFromDestStop / WALKING_SPEED_MPS / 60);

                    // Calculate diff
                    let diff = arrivalMins - currentMins;

                    // Handle day wrap (Next Day)
                    // If departureDay is tomorrow (or just diff is negative/too small implies wrap)
                    // But explicitly: firstLegDeparture.day vs current dayName.
                    // If transfer wraps day... tricky.
                    // Simple heuristic: If arrival is earlier than current time, assume next day (+1440).
                    // Or if explicit 'departureDay' is set and != dayName.

                    if (diff < 0) {
                        diff += 24 * 60;
                    }
                    else if (firstLegDeparture.minutesUntil === null) {
                        // This implies next day finding
                        // If we found a bus tomorrow, ensure we adding 24h if times look like today?
                        // Actually if firstLegDeparture is tomorrow, arrivalMins IS tomorrow.
                        // But diff might be small positive if 19:09 -> 19:15 tomorrow? (No, 19:09 -> 07:00 is negative).
                        // If 19:09 -> 07:00. 420 - 1149 = -729. +1440 = 711 mins. Correct.
                    }

                    return diff + Math.ceil(walkFromDestStop / WALKING_SPEED_MPS / 60); // Walk to Dest is after bus
                })(),
                busArrivalTime: (function () {
                    if (!secondLegDeparture) return null;
                    const leg2OriginOff = getDynamicOffset(secondLegRoute.routeName, secondLegRoute.headsign, secondLegRoute.originStopIndex) || 0;
                    const leg2DestOff = getDynamicOffset(secondLegRoute.routeName, secondLegRoute.headsign, secondLegRoute.destStopIndex) || 0;
                    const leg2Duration = Math.max(0, leg2DestOff - leg2OriginOff);
                    return addMinutesToTime(secondLegDeparture.time, leg2Duration);
                })()
            },
            steps: [
                {
                    type: 'walk',
                    instruction: `Walk to ${effectiveOriginStop.name}`,
                    from: originCoords,
                    to: { lat: effectiveOriginStop.lat, lon: effectiveOriginStop.lon },
                    distance: Math.round(walkToOriginStop),
                    duration: Math.ceil(walkToOriginStop / WALKING_SPEED_MPS / 60)
                },
                {
                    type: 'board',
                    instruction: `Board ${firstLegRoute.routeName} (${firstLegRoute.headsign})`,
                    stopName: effectiveOriginStop.name,
                    stopId: effectiveOriginStop.id,
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
                firstLeg: (function () {
                    if (firstLegRoute.isLoop && firstLegRoute.loopInfo) {
                        // Combine geometries for loop route
                        const k1 = getRouteGeometryKey(firstLegRoute.routeName, firstLegRoute.loopInfo.firstLeg);
                        const k2 = getRouteGeometryKey(firstLegRoute.routeName, firstLegRoute.loopInfo.secondLeg);
                        const g1 = routeGeometries[k1];
                        const g2 = routeGeometries[k2];
                        if (g1 && g2) {
                            return { type: 'LineString', coordinates: [...g1.coordinates, ...g2.coordinates] };
                        }
                        return g1 || g2;
                    }
                    return routeGeometries[getRouteGeometryKey(firstLegRoute.routeName, firstLegRoute.headsign)];
                })(),
                secondLeg: (function () {
                    if (secondLegRoute.isLoop && secondLegRoute.loopInfo) {
                        // Combine geometries for loop route
                        const k1 = getRouteGeometryKey(secondLegRoute.routeName, secondLegRoute.loopInfo.firstLeg);
                        const k2 = getRouteGeometryKey(secondLegRoute.routeName, secondLegRoute.loopInfo.secondLeg);
                        const g1 = routeGeometries[k1];
                        const g2 = routeGeometries[k2];
                        if (g1 && g2) {
                            return { type: 'LineString', coordinates: [...g1.coordinates, ...g2.coordinates] };
                        }
                        return g1 || g2;
                    }
                    return routeGeometries[getRouteGeometryKey(secondLegRoute.routeName, secondLegRoute.headsign)];
                })()
            },
            originStop: effectiveOriginStop,
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
            departure = { time: nextBus.time, minutesUntil: null, tripStartTime: nextBus.tripStartTime };
            departureDay = nextBus.day;
        } else {
            return {
                error: 'No bus service available',
                suggestion: 'There may be no bus service on this route.'
            };
        }
    }

    // Calculate Arrival Time at Destination
    // departure has { time, tripStartTime }
    // tripStartTime is start of trip.
    // Dest Arrival = tripStartTime + offset(destIndex)
    let busArrivalTime = null;
    let totalDuration = 0;

    // Calculate walks first
    const originStop = useAlternativeStop ? alternativeStop : primaryStop;
    const walkToOriginStop = haversineDistance(
        originCoords.lat, originCoords.lon,
        originStop.lat, originStop.lon
    );
    const actualDestStop = (bestRoute && bestRoute._actualDestStop) ? bestRoute._actualDestStop : destStop;
    const walkFromDestStop = haversineDistance(
        actualDestStop.lat, actualDestStop.lon,
        destLocation.lat, destLocation.lon
    );
    const walkToDuration = Math.ceil(walkToOriginStop / WALKING_SPEED_MPS / 60);
    const walkFromDuration = Math.ceil(walkFromDestStop / WALKING_SPEED_MPS / 60);

    let eta = null;

    if (departure.tripStartTime) {
        const destOffset = getDynamicOffset(bestRoute.routeName, bestRoute.headsign, bestRoute.destStopIndex);
        const [h, m] = departure.tripStartTime.split(':').map(Number);

        // Calculate Arrival Minutes
        let arrivalMinutes = h * 60 + m + destOffset;

        // Format Arrival Time
        const arrH = Math.floor(arrivalMinutes / 60) % 24;
        const arrM = arrivalMinutes % 60;
        busArrivalTime = `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`;

        // Calculate Total Duration
        // Logic: WalkToStop + (BusArrival - BusDeparture) + WalkFromStop

        // Use departure.time (boarding time) not tripStartTime (route start time)
        const [boardH, boardM] = departure.time.split(':').map(Number);
        const boardMinutes = boardH * 60 + boardM;

        const busTravelMinutes = arrivalMinutes - boardMinutes;
        totalDuration = walkToDuration + busTravelMinutes + walkFromDuration;

        // Calculate ETA
        const etaMinutes = arrivalMinutes + walkFromDuration;
        const etaH = Math.floor(etaMinutes / 60) % 24;
        const etaM = etaMinutes % 60;
        eta = `${String(etaH).padStart(2, '0')}:${String(etaM).padStart(2, '0')}`;
    }

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

    const stopCount = bestRoute.isLoop
        ? bestRoute.stopsSequence.length - 1
        : bestRoute.destStopIndex - bestRoute.originStopIndex;

    const steps = [
        {
            type: 'walk',
            instruction: useAlternativeStop
                ? `Walk to ${originStop.name} (has direct route)`
                : `Walk to ${originStop.name}`,
            from: originCoords,
            to: { lat: originStop.lat, lon: originStop.lon },
            distance: Math.round(walkToOriginStop),
            duration: walkToDuration
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
            instruction: `Ride ${stopCount} stops to ${actualDestStop.name}`,
            duration: Math.round(totalDuration - walkToDuration - walkFromDuration) // Approx ride time
        },
        {
            type: 'alight',
            instruction: `Alight at ${actualDestStop.name}`,
            stopName: actualDestStop.name,
            stopId: actualDestStop.id
        },
        {
            type: 'walk',
            instruction: `Walk to ${destLocation.name}`,
            from: { lat: actualDestStop.lat, lon: actualDestStop.lon },
            to: destLocation,
            distance: Math.round(walkFromDestStop),
            duration: walkFromDuration
        }
    ];

    return {
        type: 'DIRECT',
        destination: destLocation,
        summary: {
            route: bestRoute.routeName,
            headsign: bestRoute.headsign,
            departure: departure.time,
            minutesUntil: departure.minutesUntil,
            departureDay: departureDay, // Will be null if today, or day name if future
            busArrivalTime: busArrivalTime,
            totalDuration: totalDuration,
            eta: eta
        },
        steps,
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
        destStop: actualDestStop
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

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
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
                        day: nextDay.charAt(0).toUpperCase() + nextDay.slice(1),
                        tripStartTime: dep.tripStartTime
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
                    day: nextDay.charAt(0).toUpperCase() + nextDay.slice(1),
                    tripStartTime: dep.tripStartTime
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
