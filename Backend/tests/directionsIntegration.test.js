/**
 * Integration tests for directions/index.js (Main Orchestrator)
 */

const directions = require('../directions/index');

// Mocks
jest.mock('../utils/geo', () => ({
    haversineDistance: jest.fn()
}));
const { haversineDistance } = require('../utils/geo');

jest.mock('../directions/locationService', () => ({
    getLocationById: jest.fn(),
    findNearestStopsSync: jest.fn(), // used in index.js to find stops near dest
    getStopById: jest.fn(),
    findNearestStops: jest.fn() // used for origin
}));
const locationService = require('../directions/locationService');

jest.mock('../directions/routeFinder', () => ({
    findDirectRoutes: jest.fn(),
    findRoutesToNearbyStops: jest.fn(),
    findTransferCandidates: jest.fn(),
    getRoutesForStop: jest.fn(),
    TRANSFER_POINTS: ['CP']
}));
const routeFinder = require('../directions/routeFinder');

jest.mock('../directions/scheduler', () => ({
    getCurrentDayName: jest.fn(() => 'Monday'),
    getNextDeparture: jest.fn(),
    findNextAvailableBusForRoute: jest.fn(),
    timeToMinutes: jest.fn(t => (t ? parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]) : 0)),
    getDynamicOffset: jest.fn(() => 0),
    addMinutesToTime: jest.fn((time, mins) => '12:00') // Simplified
}));
const scheduler = require('../directions/scheduler');

jest.mock('../directions/routeScorer', () => ({
    evaluateCandidates: jest.fn(),
    isWalkingBetter: jest.fn(),
    getWalkingMinutes: jest.fn(() => 5),
    WALK_ONLY_THRESHOLD_M: 500
}));
const routeScorer = require('../directions/routeScorer');

jest.mock('../directions/responseBuilder', () => ({
    buildWalkResponse: jest.fn(val => val), // passthrough for check
    buildDirectResponse: jest.fn(val => val),
    buildTransferResponse: jest.fn(val => val),
    getRouteGeometryKey: jest.fn()
}));

jest.mock('../directions/walkingService', () => ({
    getWalkingDirections: jest.fn()
}));

jest.mock('../directions/dataLoader', () => ({
    getIndexes: jest.fn(() => ({ stopsById: new Map() })),
    getRouteGeometries: jest.fn()
}));


describe('getDirections Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default mocks
        locationService.getLocationById.mockReturnValue({ id: 'DestLoc', lat: 10, lon: 10 });
        locationService.findNearestStopsSync.mockReturnValue([{ id: 'DestStop', lat: 10.001, lon: 10.001 }]); // dest stop
        locationService.getStopById.mockReturnValue({ id: 'OriginStop', lat: 0, lon: 0 }); // origin stop
        locationService.findNearestStops.mockResolvedValue([{ id: 'OriginStop', lat: 0, lon: 0 }]); // origin nearest

        haversineDistance.mockReturnValue(2000); // 2km default (bus needed)

        // Default: no direct routes found
        routeFinder.findDirectRoutes.mockReturnValue([]);
        routeFinder.findRoutesToNearbyStops.mockReturnValue([]);

        // Default scorer
        routeScorer.evaluateCandidates.mockReturnValue({});
    });

    test('returns direct bus route using findRoutesToNearbyStops', async () => {
        // Setup: findRoutesToNearbyStops returns a candidate
        const candidate = {
            route: { routeName: 'Route1', headsign: 'To Dest' },
            destStop: { id: 'DestStop' }
        };
        routeFinder.findRoutesToNearbyStops.mockReturnValue([candidate]);

        // Scorer selects it
        routeScorer.evaluateCandidates.mockReturnValue({
            route: candidate.route,
            destStop: candidate.destStop,
            departure: { time: '10:00', minutesUntil: 5, tripStartTime: '10:00' }
        });

        const result = await directions.getDirections(0, 0, null, 'DestLoc', '09:55');

        expect(result).toBeDefined();
        // Should call buildDirectResponse
        // We can check the structure directly since we mocked buildDirectResponse to passthrough
        expect(result.route.routeName).toBe('Route1');
        expect(result.departure.time).toBe('10:00');
    });

    test('falls back to transfer route using findTransferCandidates', async () => {
        // No direct routes
        routeFinder.findRoutesToNearbyStops.mockReturnValue([]);

        // Transfer candidate logic
        const transferCandidate = {
            type: 'TRANSFER',
            transferPoint: 'CP',
            firstLegs: [{ routeName: 'Route1', headsign: 'To CP', originStopIndex: 0, destStopIndex: 1 }],
            secondLeg: { routeName: 'Route2', headsign: 'To Dest', originStopIndex: 0, destStopIndex: 1 },
            destStop: { id: 'DestStop', lat: 10, lon: 10 },
            originStop: { id: 'OriginStop', lat: 0, lon: 0 }
        };

        // Mock findTransferCandidates to return this
        routeFinder.findTransferCandidates.mockReturnValue([transferCandidate]);

        // Mock Scheduler for transfer evaluation
        scheduler.getNextDeparture.mockReturnValueOnce({ time: '10:00', minutesUntil: 5 }); // Leg 1
        scheduler.getNextDeparture.mockReturnValueOnce({ time: '10:15', minutesUntil: 15 }); // Leg 2 (called later)

        const result = await directions.getDirections(0, 0, null, 'DestLoc', '09:55');

        expect(result).toBeDefined();
        expect(result.firstLeg.routeName).toBe('Route1');
        expect(result.secondLeg.routeName).toBe('Route2');
    });

    test('returns error if no routes found', async () => {
        routeFinder.findRoutesToNearbyStops.mockReturnValue([]);
        routeFinder.findTransferCandidates.mockReturnValue([]);
        routeFinder.getRoutesForStop.mockReturnValue([]);

        const result = await directions.getDirections(0, 0, null, 'DestLoc', '09:55');

        expect(result.error).toBe('No route found');
    });
});
