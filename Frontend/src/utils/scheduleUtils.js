/**
 * Utility functions for client-side schedule calculations.
 * Replicates the logic from Backend/server.js to reduce API calls.
 */

// Calculate the next bus arrival for a given route/stop
export const calculateNextBus = (routeData, timeStr, stopId = null, day = null) => {
    if (!routeData) return null;

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = day || days[new Date().getDay()];
    const isFridayPrayerBreak = currentDay === 'friday' && timeStr >= '12:40' && timeStr < '14:00';

    // Find active service for today
    const activeService = routeData.services.find(s => s.days.includes(currentDay));
    if (!activeService) {
        return { nextBus: null, message: 'No service today' };
    }

    let nextBus = null;
    let upcoming = [];
    const ONE_HOUR_MINS = 60;

    // Helper to convert HH:MM to minutes
    const toMins = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    const currentTotal = toMins(timeStr);

    for (const trip of activeService.trips) {
        // Check if this trip visits the requested stop
        let stopOffset = 0;
        let stopIndex = -1;

        if (stopId) {
            stopIndex = trip.stops_sequence.indexOf(stopId);
            if (stopIndex === -1) continue; // Stop not in this trip

            if (trip.arrival_offsets && trip.arrival_offsets[stopIndex] !== undefined) {
                stopOffset = trip.arrival_offsets[stopIndex];
            } else {
                // Fallback assuming 3 mins per stop if no offsets
                // Matches backend logic
                stopOffset = stopIndex * 3;
            }
        }

        if (!trip.times || trip.times.length === 0) continue;

        for (const startTime of trip.times) {
            // Skip if start time is during Friday prayer break
            if (isFridayPrayerBreak || (currentDay === 'friday' && startTime >= '12:40' && startTime < '14:00')) {
                continue;
            }

            // Calculate Arrival Time (Start Time + Offset)
            const startTotal = toMins(startTime);
            const arrivalTotal = startTotal + stopOffset;

            // Format back to HH:MM
            const arrH = Math.floor(arrivalTotal / 60) % 24;
            const arrM = arrivalTotal % 60;
            const arrivalTime = `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`;

            if (arrivalTotal >= currentTotal) {
                const remaining = arrivalTotal - currentTotal;

                if (remaining <= ONE_HOUR_MINS) {
                    const busInfo = {
                        time: arrivalTime,
                        remaining: remaining,
                        route: routeData.name,
                        headsign: trip.headsign,
                        stop: stopId || trip.stops_sequence[0]
                    };

                    upcoming.push(busInfo);

                    if (!nextBus || remaining < nextBus.remaining) {
                        nextBus = busInfo;
                    }
                }
            }
        }
    }

    // Sort upcoming by remaining time
    upcoming.sort((a, b) => a.remaining - b.remaining);

    // Deduplicate (same time, same route)
    upcoming = upcoming.filter((bus, index, self) =>
        index === self.findIndex((b) => (
            b.time === bus.time && b.route === bus.route
        ))
    );

    return { nextBus, upcoming };
};

// Batch calculation for multiple routes (replacing the need for batched API)
export const calculateAllNextBuses = (routes, timeStr, stopId = null) => {
    const results = {};
    if (!routes) return results;

    routes.forEach(route => {
        results[route.name] = calculateNextBus(route, timeStr, stopId);
    });

    return results;
};
