/**
 * scheduler.js - Optimized bus departure time calculations  
 * Uses cached duration data and efficient time parsing
 */

const { getRouteDurations } = require('./dataLoader');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Pre-computed time values for Friday prayer check
const FRIDAY_PRAYER_START = 12 * 60 + 40; // 12:40
const FRIDAY_PRAYER_END = 14 * 60; // 14:00

// Cache for parsed times (route key → parsed times array)
const parsedTimesCache = new Map();

/**
 * Parse time string to minutes - with caching
 */
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * Format minutes to time string
 */
function minutesToTime(totalMinutes) {
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Add minutes to time string
 */
function addMinutesToTime(timeStr, minutes) {
    return minutesToTime(timeToMinutes(timeStr) + minutes);
}

/**
 * Get current day name
 */
function getCurrentDayName(dayOverride = null) {
    if (dayOverride) return dayOverride.toLowerCase();
    return DAYS[new Date().getDay()];
}

/**
 * Check if route operates on day - optimized
 */
function routeOperatesOnDay(route, dayName) {
    if (!route.serviceDays) return false;
    const lowerDay = dayName.toLowerCase();
    for (const d of route.serviceDays) {
        if (d.toLowerCase() === lowerDay) return true;
    }
    return false;
}

/**
 * Check Friday prayer time - inline for speed
 */
function isDuringFridayPrayer(arrivalMinutes, dayName) {
    return dayName === 'friday' &&
        arrivalMinutes >= FRIDAY_PRAYER_START &&
        arrivalMinutes < FRIDAY_PRAYER_END;
}

/**
 * Get dynamic offset using cached duration data
 */
function getDynamicOffset(routeName, headsign, targetIndex) {
    if (targetIndex === 0) return 0;

    const routeDurations = getRouteDurations();
    const key = `${routeName}_${headsign}`;
    const data = routeDurations[key];

    if (!data?.segments) {
        return targetIndex * 2; // Fallback: 2 mins per stop
    }

    let cumulativeSecs = 0;
    const maxIdx = Math.min(targetIndex, data.segments.length);
    for (let i = 0; i < maxIdx; i++) {
        if (data.segments[i]) {
            cumulativeSecs += data.segments[i].totalSecs;
        }
    }

    return Math.round(cumulativeSecs / 60);
}

/**
 * Get pre-parsed times for a route (cached)
 */
function getParsedTimes(route) {
    const key = `${route.routeName}:${route.headsign}`;

    if (parsedTimesCache.has(key)) {
        return parsedTimesCache.get(key);
    }

    const parsed = route.times.map(t => ({
        original: t,
        minutes: timeToMinutes(t)
    }));

    parsedTimesCache.set(key, parsed);
    return parsed;
}

/**
 * Get next departure - optimized with pre-parsed times
 */
function getNextDeparture(route, stopIndex, currentTime, dayName) {
    if (!routeOperatesOnDay(route, dayName)) return null;

    const currentMinutes = timeToMinutes(currentTime);
    const timeOffsetMinutes = getDynamicOffset(route.routeName, route.headsign, stopIndex);
    const parsedTimes = getParsedTimes(route);

    for (const { original, minutes } of parsedTimes) {
        const arrivalMinutes = minutes + timeOffsetMinutes;

        if (isDuringFridayPrayer(arrivalMinutes, dayName)) continue;

        if (arrivalMinutes >= currentMinutes) {
            return {
                time: minutesToTime(arrivalMinutes),
                minutesUntil: arrivalMinutes - currentMinutes,
                tripStartTime: original
            };
        }
    }

    return null;
}

/**
 * Get multiple upcoming departures
 */
function getUpcomingDepartures(route, stopIndex, currentTime, dayName, count = 3) {
    if (!routeOperatesOnDay(route, dayName)) return [];

    const currentMinutes = timeToMinutes(currentTime);
    const timeOffsetMinutes = getDynamicOffset(route.routeName, route.headsign, stopIndex);
    const parsedTimes = getParsedTimes(route);
    const results = [];

    for (const { original, minutes } of parsedTimes) {
        if (results.length >= count) break;

        const arrivalMinutes = minutes + timeOffsetMinutes;

        if (isDuringFridayPrayer(arrivalMinutes, dayName)) continue;

        if (arrivalMinutes >= currentMinutes) {
            results.push({
                time: minutesToTime(arrivalMinutes),
                minutesUntil: arrivalMinutes - currentMinutes
            });
        }
    }

    return results;
}

/**
 * Find next available bus for a route (next day fallback)
 */
function findNextAvailableBusForRoute(route, currentTime, currentDay) {
    const currentDayIndex = DAYS.indexOf(currentDay);

    for (let offset = 1; offset <= 7; offset++) {
        const nextDayIndex = (currentDayIndex + offset) % 7;
        const nextDay = DAYS[nextDayIndex];

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
    getCurrentDayName,
    routeOperatesOnDay,
    timeToMinutes,
    minutesToTime,
    addMinutesToTime,
    getDynamicOffset,
    isDuringFridayPrayer,
    getNextDeparture,
    getUpcomingDepartures,
    findNextAvailableBusForRoute,
    DAYS
};
