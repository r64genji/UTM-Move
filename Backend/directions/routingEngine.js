/**
 * routingEngine.js - Unified Routing Engine for UTM Move
 * Combines A* Pathfinding (astar.js) and Strategic Route Scoring (routeScorer.js)
 */

const { haversineDistance } = require('../utils/geo');
const { timeToMinutes, minutesToTime, getNextDeparture, findNextAvailableBusForRoute, getDynamicOffset, DAYS } = require('./scheduler');
const { getIndexes } = require('./dataLoader');

// --- Constants ---

// Speed & Distance
const WALK_SPEED_M_PER_MIN = 83.33; // 5 km/h = 5000m / 60min ~= 83.33 m/min
const BUS_SPEED_M_PER_MIN = 666;    // ~40 km/h (Conservative estimate for heuristic)
const MAX_WALKING_DIST_M = 800;     // Look for stops within 800m of origin/dest
const TIMEOUT_MINUTES = 120;        // Max search horizon

// Reluctance & Penalties (Tuned for optimal behavior)
const WALK_RELUCTANCE_FACTOR = 3.0;   // Penalty for walking during transfers
const INITIAL_WALK_RELUCTANCE = 10;  // Favor closer boarding stops
const FINAL_WALK_RELUCTANCE = 100;    // Aggressively favor speed near destination
const TRANSFER_PENALTY_MINS = 10;     // Balanced penalty for route switching
const BUS_BOARD_PENALTY = 2;          // Minor penalty for every bus boarded
const SAME_ROUTE_HOP_PENALTY = 0.8;   // Discourage long loops
const TRANSFER_WALK_LIMIT_M = 300;    // Allow walking between nearby stops for transfers (increased to enable AM→CP transfer)
const TRANSFER_WALK_PENALTY = 2;      // Extra penalty for walking between different-ID stops during transfer
const DIRECT_TO_DEST_BONUS = 0.35;    // Aggressively reduce walk penalty when stop has direct route to destination stop

// Strategy Thresholds
const WALK_ONLY_THRESHOLD_M = 500;    // Suggest walking under 500m
const PREFER_WALK_THRESHOLD_M = 1000; // Compare walk vs bus under 1km

// --- Utility Functions ---

/**
 * Calculate walking duration in minutes
 * @param {number} distanceM - Distance in meters
 * @returns {number} Walking time in minutes
 */
function getWalkingMinutes(distanceM) {
    return Math.ceil(distanceM / WALK_SPEED_M_PER_MIN);
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

// --- A* Pathfinding Implementation ---

/**
 * Min-Heap Priority Queue for A*
 */
class PriorityQueue {
    constructor() {
        this.heap = [];
    }

    push(item) {
        this.heap.push(item);
        this._bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.heap.length === 0) return null;
        const top = this.heap[0];
        const bottom = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = bottom;
            this._sinkDown(0);
        }
        return top;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    _bubbleUp(index) {
        let node = this.heap[index];
        while (index > 0) {
            let parentIdx = Math.floor((index - 1) / 2);
            let parent = this.heap[parentIdx];
            if (node.f >= parent.f) break;
            this.heap[index] = parent;
            this.heap[parentIdx] = node;
            index = parentIdx;
        }
    }

    _sinkDown(index) {
        let length = this.heap.length;
        let node = this.heap[index];
        while (true) {
            let leftIdx = 2 * index + 1;
            let rightIdx = 2 * index + 2;
            let swap = null;
            let leftChild, rightChild;

            if (leftIdx < length) {
                leftChild = this.heap[leftIdx];
                if (leftChild.f < node.f) swap = leftIdx;
            }

            if (rightIdx < length) {
                rightChild = this.heap[rightIdx];
                if (
                    (swap === null && rightChild.f < node.f) ||
                    (swap !== null && rightChild.f < leftChild.f)
                ) {
                    swap = rightIdx;
                }
            }

            if (swap === null) break;
            this.heap[index] = this.heap[swap];
            this.heap[swap] = node;
            index = swap;
        }
    }
}

/**
 * Heuristic function: Estimated time to destination
 */
function heuristic(stop, dest) {
    const dist = haversineDistance(stop.lat, stop.lon, dest.lat, dest.lon);
    return dist / BUS_SPEED_M_PER_MIN;
}

/**
 * Find optimal path using A*
 */
function findOptimalPath(originLat, originLon, destLocation, startTime, dayName) {
    const indexes = getIndexes();
    const startTimeMins = timeToMinutes(startTime);

    // Check if destination is a bus stop OR near a bus stop - if so, favor routes that go directly there
    const destIsStop = indexes.stopsById.has(destLocation.id);
    const routesServingDest = new Set();
    let nearbyDestStop = null; // The bus stop near the destination (for pinned locations)
    const NEAR_STOP_THRESHOLD_M = 150; // Consider destination "at" a stop if within 150m

    if (destIsStop) {
        // Destination IS a bus stop
        nearbyDestStop = indexes.stopsById.get(destLocation.id);
        const destRoutes = indexes.routesByStop.get(destLocation.id) || [];
        destRoutes.forEach(r => {
            if (r.stopsSequence.includes(destLocation.id)) {
                routesServingDest.add(`${r.routeName}:${r.headsign}`);
            }
        });
    } else {
        // Check if destination is NEAR a bus stop (for pinned locations)
        for (const stop of indexes.stopsArray) {
            const distToStop = haversineDistance(destLocation.lat, destLocation.lon, stop.lat, stop.lon);
            if (distToStop <= NEAR_STOP_THRESHOLD_M) {
                // Found a nearby stop - treat this as if destination is that stop
                nearbyDestStop = stop;
                const destRoutes = indexes.routesByStop.get(stop.id) || [];
                destRoutes.forEach(r => {
                    if (r.stopsSequence.includes(stop.id)) {
                        routesServingDest.add(`${r.routeName}:${r.headsign}`);
                    }
                });
                break; // Use the first nearby stop found
            }
        }
    }

    // Flag for detecting if we should apply direct route preference
    const hasNearbyDestStop = nearbyDestStop !== null;

    const openSet = new PriorityQueue();
    const closedSet = new Map(); // stopId -> min g-score

    // 1. Identify start nodes (stops near origin)
    const allStartStops = [];
    for (const stop of indexes.stopsArray) {
        const dist = haversineDistance(originLat, originLon, stop.lat, stop.lon);
        if (dist <= MAX_WALKING_DIST_M) {
            allStartStops.push({ stop, dist });
        }
    }

    // 2. Filter to prefer closest stop per route
    const closestStopPerRoute = new Map();
    for (const { stop, dist } of allStartStops) {
        const routes = indexes.routesByStop.get(stop.id) || [];
        for (const route of routes) {
            const routeKey = `${route.routeName}:${route.headsign}`;
            const existing = closestStopPerRoute.get(routeKey);
            if (!existing || dist < existing.dist) {
                closestStopPerRoute.set(routeKey, { stop, dist });
            }
        }
    }

    const startStopsSet = new Map();
    for (const { stop, dist } of closestStopPerRoute.values()) {
        if (!startStopsSet.has(stop.id) || dist < startStopsSet.get(stop.id).dist) {
            startStopsSet.set(stop.id, { stop, dist });
        }
    }

    startStopsSet.forEach(({ stop, dist }) => {
        const walkTime = dist / WALK_SPEED_M_PER_MIN;

        // Check if this stop has a direct route to the destination stop (or nearby stop)
        let hasDirectRouteToDest = false;
        if (hasNearbyDestStop && routesServingDest.size > 0) {
            const stopRoutes = indexes.routesByStop.get(stop.id) || [];
            hasDirectRouteToDest = stopRoutes.some(r => {
                const routeKey = `${r.routeName}:${r.headsign}`;
                // Check if this route serves the destination AND destination comes after this stop
                if (routesServingDest.has(routeKey)) {
                    const destIdx = r.stopsSequence.indexOf(nearbyDestStop.id);
                    return destIdx > r.stopIndex; // Destination must be reachable from this stop
                }
                return false;
            });
        }

        // Reduce walk penalty if this stop offers a direct route to the destination
        const effectiveReluctance = hasDirectRouteToDest
            ? INITIAL_WALK_RELUCTANCE * DIRECT_TO_DEST_BONUS
            : INITIAL_WALK_RELUCTANCE;
        const walkPenalty = walkTime * (effectiveReluctance - 1);

        const arrivalTime = startTimeMins + walkTime;
        const gCost = arrivalTime + walkPenalty;
        const h = heuristic(stop, destLocation);

        openSet.push({
            stopId: stop.id,
            arrivalTime: arrivalTime,
            accPenalty: walkPenalty,
            g: gCost,
            f: gCost + h,
            path: [{
                type: 'WALK',
                from: { lat: originLat, lon: originLon, name: 'Origin' },
                to: stop,
                distance: dist,
                duration: walkTime,
                endTime: arrivalTime
            }]
        });
    });

    let bestSolution = null;

    while (!openSet.isEmpty()) {
        const current = openSet.pop();

        // Closed Set Pruning
        if (closedSet.has(current.stopId) && closedSet.get(current.stopId) <= current.g) continue;
        closedSet.set(current.stopId, current.g);

        if (current.arrivalTime - startTimeMins > TIMEOUT_MINUTES) continue;

        // Goal Check
        const stopObj = indexes.stopsById.get(current.stopId);
        const distToDest = haversineDistance(stopObj.lat, stopObj.lon, destLocation.lat, destLocation.lon);

        if (distToDest <= MAX_WALKING_DIST_M) {
            const walkTime = distToDest / WALK_SPEED_M_PER_MIN;

            // When destination is near a bus stop, strongly penalize alighting at a different stop
            // This encourages waiting for a bus that goes directly to (or very close to) the destination
            const isAtNearbyDestStop = hasNearbyDestStop && (current.stopId === nearbyDestStop.id);
            // Use HIGH penalty (FINAL_WALK_RELUCTANCE) when NOT at the nearby dest stop, LOW (1.1) when at it
            const finalReluctance = (hasNearbyDestStop && !isAtNearbyDestStop)
                ? FINAL_WALK_RELUCTANCE   // High penalty for walking from wrong stop when dest is near a bus stop
                : 1.1;                     // Minimal penalty when at the correct stop or no nearby stop
            const walkPenalty = walkTime * (finalReluctance - 1);

            const totalEndTime = current.arrivalTime + walkTime;
            const totalCost = totalEndTime + current.accPenalty + walkPenalty;

            if (!bestSolution || totalCost < bestSolution.totalCost) {
                bestSolution = {
                    totalEndTime,
                    totalCost,
                    path: [
                        ...current.path,
                        {
                            type: 'WALK',
                            from: stopObj,
                            to: destLocation,
                            distance: distToDest,
                            duration: walkTime,
                            endTime: totalEndTime
                        }
                    ]
                };
            }
        }

        // Expand Neighbors (Current Stop + Nearby Stops for Transfers)
        const nearbyStops = [{ stop: stopObj, dist: 0 }];

        // 1. Find all reachable stops within walk limit for transfer
        for (const stop of indexes.stopsArray) {
            if (stop.id === current.stopId) continue;
            const dist = haversineDistance(stopObj.lat, stopObj.lon, stop.lat, stop.lon);
            if (dist <= TRANSFER_WALK_LIMIT_M) {
                nearbyStops.push({ stop, dist });
            }
        }

        for (const { stop: candidateStop, dist: transferDist } of nearbyStops) {
            const routes = indexes.routesByStop.get(candidateStop.id) || [];
            const walkTime = transferDist / WALK_SPEED_M_PER_MIN;
            const walkPenalty = walkTime * (WALK_RELUCTANCE_FACTOR - 1) + (transferDist > 0 ? TRANSFER_WALK_PENALTY : 0);
            const arrivalAfterWalk = current.arrivalTime + walkTime;
            const penaltyAfterWalk = current.accPenalty + walkPenalty;

            for (const routeDef of routes) {
                const dep = getNextDeparture(
                    { routeName: routeDef.routeName, headsign: routeDef.headsign, serviceDays: routeDef.serviceDays, times: routeDef.times },
                    routeDef.stopIndex,
                    minutesToTime(Math.ceil(arrivalAfterWalk)),
                    dayName
                );

                if (dep) {
                    const depTimeMins = timeToMinutes(dep.time);
                    let waitTime = depTimeMins - current.arrivalTime; // Wait is from current time, not walk arrival
                    if (waitTime < 0) continue;

                    for (let i = routeDef.stopIndex + 1; i < routeDef.stopsSequence.length; i++) {
                        const nextStopId = routeDef.stopsSequence[i];
                        const originOffset = getDynamicOffset(routeDef.routeName, routeDef.headsign, routeDef.stopIndex);
                        const destOffset = getDynamicOffset(routeDef.routeName, routeDef.headsign, i);
                        const travelTime = Math.max(0, destOffset - originOffset);
                        const arrivalAtNext = depTimeMins + travelTime;

                        const nextStop = indexes.stopsById.get(nextStopId);
                        if (!nextStop) continue;

                        let addedPenalty = (transferDist > 0 ? walkPenalty : 0);
                        const lastStep = current.path[current.path.length - 1];

                        // Check if we are starting a NEW leg or continuing the current one
                        // Note: If we walked to a nearby stop, it's always a NEW leg (or same route different stop, but usually it's a transfer)
                        const isNewLeg = transferDist > 0 || !(lastStep && lastStep.type === 'BUS' && lastStep.routeName === routeDef.routeName && lastStep.headsign === routeDef.headsign);

                        if (isNewLeg) {
                            addedPenalty += BUS_BOARD_PENALTY;
                            // Add significant penalty if this is a transfer (switching routes)
                            if (lastStep && lastStep.type === 'BUS' && lastStep.routeName !== routeDef.routeName) {
                                addedPenalty += TRANSFER_PENALTY_MINS;
                            }
                        } else {
                            // Same leg expansion - minor cost to represent travel
                            addedPenalty += SAME_ROUTE_HOP_PENALTY;
                        }

                        const newAccPenalty = current.accPenalty + addedPenalty;
                        const newG = arrivalAtNext + newAccPenalty;
                        const newH = heuristic(nextStop, destLocation);

                        let newPath;
                        if (!isNewLeg) {
                            newPath = [...current.path];
                            newPath[newPath.length - 1] = {
                                ...lastStep,
                                to: nextStop,
                                arrivalTimeStr: minutesToTime(arrivalAtNext),
                                duration: arrivalAtNext - timeToMinutes(lastStep.departureTime)
                            };
                        } else {
                            newPath = [...current.path];
                            // If we walked between stops, add a transfer walk step
                            if (transferDist > 0) {
                                newPath.push({
                                    type: 'WALK',
                                    from: stopObj,
                                    to: candidateStop,
                                    distance: transferDist,
                                    duration: walkTime,
                                    endTime: arrivalAfterWalk
                                });
                            }
                            newPath.push({
                                type: 'BUS',
                                routeName: routeDef.routeName,
                                headsign: routeDef.headsign,
                                from: candidateStop,
                                to: nextStop,
                                departureTime: dep.time,
                                arrivalTimeStr: minutesToTime(arrivalAtNext),
                                duration: travelTime + waitTime,
                                waitTime: waitTime
                            });
                        }

                        openSet.push({
                            stopId: nextStopId,
                            arrivalTime: arrivalAtNext,
                            accPenalty: newAccPenalty,
                            g: newG,
                            f: newG + newH,
                            path: newPath
                        });
                    }
                }
            }
        }
    }

    return bestSolution;
}

// --- High-Level Strategy Logic ---

/**
 * Score a candidate route option (used for simpler heuristic evaluations)
 */
function scoreRoute(route, departure, destStop, destLocation) {
    const waitMins = departure.minutesUntil || 0;
    const busMins = getBusTravelMinutes(route);
    const walkFromDist = haversineDistance(destStop.lat, destStop.lon, destLocation.lat, destLocation.lon);
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
 * Evaluate multiple route candidates to pick the best simple option
 */
function evaluateCandidates(candidates, destLocation, currentTime, dayName) {
    let bestRoute = null;
    let bestScore = Infinity;
    let bestDestStop = null;
    let bestDeparture = null;

    let bestNonLoopRoute = null;
    let bestNonLoopScore = Infinity;

    for (const { route, destStop } of candidates) {
        let departure = getNextDeparture(route, route.originStopIndex, currentTime, dayName);

        if (!departure) {
            const nextBus = findNextAvailableBusForRoute(route, currentTime, dayName);
            if (nextBus) {
                const now = timeToMinutes(currentTime);
                let wait = timeToMinutes(nextBus.time) - now;
                if (wait < 0) wait += 24 * 60;
                departure = { time: nextBus.time, minutesUntil: wait, tripStartTime: nextBus.tripStartTime };
            }
        }

        if (!departure) continue;

        const score = scoreRoute(route, departure, destStop, destLocation);

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

    // Prefer non-loop route if comparable
    if (bestRoute?.isLoop && bestNonLoopRoute && bestNonLoopScore <= bestScore + 10) {
        return { route: bestNonLoopRoute, destStop: bestNonLoopStop, departure: bestNonLoopDeparture, score: bestNonLoopScore };
    }

    return { route: bestRoute, destStop: bestDestStop, departure: bestDeparture, score: bestScore };
}

/**
 * Policy: Is walking better than the current bus option?
 */
function isWalkingBetter(route, originCoords, originStop, destStop, destLocation, directDistance, departure) {
    if (directDistance >= PREFER_WALK_THRESHOLD_M) return false;

    const walkToMins = getWalkingMinutes(haversineDistance(originCoords.lat, originCoords.lon, originStop.lat, originStop.lon));
    const waitMins = departure.minutesUntil || 0;
    const busMins = getBusTravelMinutes(route);
    const walkFromMins = getWalkingMinutes(haversineDistance(destStop.lat, destStop.lon, destLocation.lat, destLocation.lon));

    const totalBusTime = walkToMins + waitMins + busMins + walkFromMins;
    const totalWalkTime = getWalkingMinutes(directDistance);

    const stopCount = route.isLoop ? route.stopsSequence.length - 1 : route.destStopIndex - route.originStopIndex;

    return totalWalkTime <= totalBusTime || stopCount > 15;
}

// --- Exports ---

module.exports = {
    findOptimalPath,
    scoreRoute,
    evaluateCandidates,
    isWalkingBetter,
    getBusTravelMinutes,
    getWalkingMinutes,
    WALK_SPEED_M_PER_MIN,
    WALK_ONLY_THRESHOLD_M,
    PREFER_WALK_THRESHOLD_M
};
