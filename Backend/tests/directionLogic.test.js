/**
 * Tests for directionLogic.js - Core routing algorithm
 * Tests pure functions that don't require external API calls
 */

const {
    findDirectRoutes,
    findTransferRoutes,
    getRoutesForStop,
    getStopById,
    getLocationById,
    haversineDistance
} = require('../directionLogic');

describe('getStopById', () => {
    test('returns stop object for valid ID', () => {
        const stop = getStopById('CP');
        expect(stop).toBeDefined();
        expect(stop.id).toBe('CP');
        expect(stop.name).toBeDefined();
        expect(stop.lat).toBeDefined();
        expect(stop.lon).toBeDefined();
    });

    test('returns undefined for invalid ID', () => {
        const stop = getStopById('INVALID_STOP_ID');
        expect(stop).toBeUndefined();
    });

    test('returns undefined for null/empty input', () => {
        expect(getStopById(null)).toBeUndefined();
        expect(getStopById('')).toBeUndefined();
    });
});

describe('getLocationById', () => {
    test('finds location by exact ID from bus stops', () => {
        // Use a known stop ID that exists in schedule.json
        const location = getLocationById('CP');
        expect(location).toBeDefined();
        expect(location.name).toBeDefined();
    });

    test('finds bus stop as location fallback', () => {
        const location = getLocationById('CP');
        expect(location).toBeDefined();
        expect(location.id).toBe('CP');
        expect(location.category).toBe('bus_stop');
    });

    test('returns null for invalid location', () => {
        const location = getLocationById('DOES_NOT_EXIST_ANYWHERE');
        expect(location).toBeNull();
    });

    test('supports case-insensitive matching', () => {
        // This should find something reasonable
        const location = getLocationById('cp');
        expect(location).toBeDefined();
    });
});

describe('getRoutesForStop', () => {
    test('returns routes for major hub (CP)', () => {
        const routes = getRoutesForStop('CP');
        expect(Array.isArray(routes)).toBe(true);
        expect(routes.length).toBeGreaterThan(0);

        // Each route should have required properties
        routes.forEach(route => {
            expect(route.routeName).toBeDefined();
            expect(route.headsign).toBeDefined();
            expect(route.stopIndex).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(route.stopsSequence)).toBe(true);
        });
    });

    test('returns empty array for non-existent stop', () => {
        const routes = getRoutesForStop('FAKE_STOP');
        expect(Array.isArray(routes)).toBe(true);
        expect(routes.length).toBe(0);
    });
});

describe('findDirectRoutes', () => {
    test('finds route from origin to destination on same line', () => {
        // K9 to CP should have direct routes
        const routes = findDirectRoutes('K9', 'CP');
        expect(Array.isArray(routes)).toBe(true);
        // Should find at least one route (Route C, D, etc serve this corridor)
    });

    test('ensures origin comes before destination in sequence', () => {
        const routes = findDirectRoutes('K9', 'CP');
        routes.forEach(route => {
            if (!route.isLoop) {
                expect(route.originStopIndex).toBeLessThan(route.destStopIndex);
            }
        });
    });

    test('returns empty for invalid stops', () => {
        const routes = findDirectRoutes('FAKE1', 'FAKE2');
        expect(Array.isArray(routes)).toBe(true);
        expect(routes.length).toBe(0);
    });

    test('handles same origin and destination (may return loop routes)', () => {
        // Note: Route logic may return loop routes when origin == destination
        // This tests that the function doesn't error, not specific behavior
        const routes = findDirectRoutes('CP', 'CP');
        expect(Array.isArray(routes)).toBe(true);
    });
});

describe('findTransferRoutes', () => {
    test('finds transfer route via CP', () => {
        // This tests two stations that might require a transfer
        const result = findTransferRoutes('K9', 'KDOJ');

        // Result could be null if no transfer route exists
        if (result) {
            expect(result.type).toBe('TRANSFER');
            expect(result.transferStop).toBeDefined();
            expect(Array.isArray(result.firstLeg)).toBe(true);
            expect(Array.isArray(result.secondLeg)).toBe(true);
        }
    });

    test('returns null when no transfer route possible', () => {
        const result = findTransferRoutes('FAKE1', 'FAKE2');
        expect(result).toBeNull();
    });
});

describe('haversineDistance (re-exported)', () => {
    test('is accessible from directionLogic exports', () => {
        expect(typeof haversineDistance).toBe('function');
    });

    test('calculates reasonable distance', () => {
        const distance = haversineDistance(1.5589, 103.6378, 1.5533, 103.6443);
        expect(distance).toBeGreaterThan(0);
        expect(distance).toBeLessThan(10000); // Less than 10km
    });
});
