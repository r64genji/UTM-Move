const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getPathDistance = (coords) => {
    let dist = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        // GeoJSON is [lon, lat]
        dist += haversine(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
    }
    return dist;
};

// Default speed if no constraint found (30 km/h)
const AVG_SPEED_MPS = 8.33;

function enrichSchedule(scheduleData, geometries) {
    const enrichedRoutes = scheduleData.routes.map(route => {
        const enrichedServices = route.services.map(service => {
            const enrichedTrips = service.trips.map(trip => {
                // 1. Find Geometry
                const geomKey = `${route.name} : ${trip.headsign}`;
                let pathDist = 0;

                // Try exact match, or fallback (some keys might have extra info)
                let matchedKey = Object.keys(geometries).find(k => k === geomKey);
                // If not found, try fuzzy? 
                if (!matchedKey) {
                    matchedKey = Object.keys(geometries).find(k => k.startsWith(route.name) && k.includes(trip.headsign));
                }

                if (matchedKey && geometries[matchedKey]) {
                    pathDist = getPathDistance(geometries[matchedKey].coordinates);
                } else {
                    // Fallback: Straight line between stops?
                    // For now, simplify.
                }

                const travelTimeSec = pathDist > 0 ? pathDist / AVG_SPEED_MPS : (trip.stops_sequence.length * 60);

                // 2. Determine Target Duration (Turnaround)
                // Look for a trip in the SAME service that goes 'opposite' or is the 'next leg'
                // Simple heuristic: Find the MINIMUM time difference between this trip's start 
                // and any OTHER trip's start in the opposite direction.

                // Identify "Opposite" trips:
                const otherTrips = service.trips.filter(t => t !== trip);

                // Get this trip's first start time (minutes from midnight)
                const getMins = (t) => {
                    const [h, m] = t.split(':').map(Number);
                    return h * 60 + m;
                };

                let minGap = Infinity;

                if (trip.times && trip.times.length > 0) {
                    const myStart = getMins(trip.times[0]);

                    // Check against all start times of all other trips
                    // We want the smallest positive gap that looks like a valid turnaround (e.g. 10-60 mins)
                    otherTrips.forEach(ot => {
                        ot.times.forEach(time => {
                            const otherStart = getMins(time);
                            const gap = otherStart - myStart;
                            if (gap > 0 && gap <= 60) { // Assume max wait 60 mins
                                if (gap < minGap) minGap = gap;
                            }
                        });
                    });
                }

                // If no valid gap found, use default logic (Travel + 30s dwell)
                let targetDurationSec = 0;
                if (minGap !== Infinity) {
                    targetDurationSec = minGap * 60;
                } else {
                    targetDurationSec = travelTimeSec + (trip.stops_sequence.length * 30);
                }

                // 3. Calculate Dwell Time
                // Total Dwell = Target - Travel
                // If negative (travel is slower than schedule), dwell is 0 (bus is late)
                let totalDwell = targetDurationSec - travelTimeSec;
                if (totalDwell < 0) totalDwell = 0;

                const dwellPerStop = totalDwell / Math.max(1, trip.stops_sequence.length); // Distribute evenly? 
                // Or maybe distribute based on distance segments?
                // User said: "use the leftover time... as the dwell time at each stop"
                // This implies uniform dwell.

                // 4. Generate Arrival Offsets (in Minutes)
                const offsets = [];
                let currentSec = 0;

                // We need distances between stops to apportion travel time
                // Since we don't have stop-to-stop geometry easily here without splitting the polyline,
                // we will approximate stop-to-stop travel time using straight-line ratio of the total path distance?
                // OR: Just use straight line distance between stops for ratio.

                const stopObjs = trip.stops_sequence.map(sid => scheduleData.stops.find(s => s.id === sid));
                let totalStraightDist = 0;
                const segmentDists = [];

                for (let i = 0; i < stopObjs.length - 1; i++) {
                    if (stopObjs[i] && stopObjs[i + 1]) {
                        const d = haversine(stopObjs[i].lat, stopObjs[i].lon, stopObjs[i + 1].lat, stopObjs[i + 1].lon);
                        segmentDists.push(d);
                        totalStraightDist += d;
                    } else {
                        segmentDists.push(0);
                    }
                }

                offsets.push(0); // First stop is at T=0

                for (let i = 0; i < segmentDists.length; i++) {
                    const segmentRatio = totalStraightDist > 0 ? segmentDists[i] / totalStraightDist : (1 / segmentDists.length);
                    const segmentTravel = travelTimeSec * segmentRatio;

                    currentSec += segmentTravel + dwellPerStop;
                    offsets.push(Math.round(currentSec / 60));
                }

                return {
                    ...trip,
                    arrival_offsets: offsets, // [0, 2, 5, 8...]
                    calculated_duration: Math.round(targetDurationSec / 60)
                };
            });
            return { ...service, trips: enrichedTrips };
        });
        return { ...route, services: enrichedServices };
    });

    return { ...scheduleData, routes: enrichedRoutes };
}

module.exports = { enrichSchedule };
