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

jest.mock('../directions/routingEngine', () => ({
    evaluateCandidates: jest.fn(),
    isWalkingBetter: jest.fn(),
    getWalkingMinutes: jest.fn(() => 5),
    WALK_ONLY_THRESHOLD_M: 500,
    findOptimalPath: jest.fn()
}));
const routingEngine = require('../directions/routingEngine');

jest.mock('../directions/responseBuilder', () => ({
    buildWalkResponse: jest.fn(val => ({ type: 'WALK_ONLY', ...val })), // passthrough for check
    buildDirectResponse: jest.fn(val => val),
    buildTransferResponse: jest.fn(val => val),
    getRouteGeometryKey: jest.fn()
}));

jest.mock('../directions/walkingService', () => ({
    getWalkingDirections: jest.fn()
}));

jest.mock('../directions/dataLoader', () => ({
    getIndexes: jest.fn(() => ({ stopsById: new Map(), stopsArray: [], routesArray: [], routesByStop: new Map() })),
    getRouteGeometries: jest.fn()
}));
const dataLoader = require('../directions/dataLoader');


// routingEngine handles both astar and scoring
// (removed redundant astar mock)

describe('getDirections Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default mocks
        locationService.getLocationById.mockReturnValue({ id: 'DestLoc', lat: 10, lon: 10 });
        locationService.findNearestStopsSync.mockReturnValue([{ id: 'DestStop', lat: 10.001, lon: 10.001 }]);
        locationService.getStopById.mockReturnValue({ id: 'OriginStop', lat: 0, lon: 0 });
        locationService.findNearestStops.mockResolvedValue([{ id: 'OriginStop', lat: 0, lon: 0 }]);
        haversineDistance.mockReturnValue(2000);

        // Indexes for route lookup in index.js
        dataLoader.getIndexes.mockReturnValue({
            stopsArray: [],
            routesArray: [{ name: 'Route1', isLoop: false }, { name: 'Route2', isLoop: false }],
            routesByStop: new Map([
                ['OriginStop', [{ routeName: 'Route1', headsign: 'To Dest', stopsSequence: ['OriginStop', 'DestStop'] }]],
                ['TransferStop', [{ routeName: 'Route2', headsign: 'To Dest', stopsSequence: ['TransferStop', 'DestStop'] }]]
            ])
        });
    });

    test('returns direct bus route from A* result', async () => {
        // Mock A* returning a direct bus path
        routingEngine.findOptimalPath.mockReturnValue({
            path: [
                { type: 'WALK', from: { lat: 0, lon: 0 }, to: { id: 'OriginStop' } },
                {
                    type: 'BUS',
                    routeName: 'Route1',
                    headsign: 'To Dest',
                    from: { id: 'OriginStop' },
                    to: { id: 'DestStop' },
                    departureTime: '10:00',
                    waitTime: 5
                },
                { type: 'WALK', from: { id: 'DestStop' }, to: { lat: 10, lon: 10 } }
            ],
            totalEndTime: 600
        });

        const result = await directions.getDirections(0, 0, null, 'DestLoc', '09:55');

        expect(result).toBeDefined();
        expect(result.route.routeName).toBe('Route1');
        expect(result.departure.time).toBe('10:00');
    });

    test('falls back to transfer route from A* result', async () => {
        // Mock A* returning a transfer path
        routingEngine.findOptimalPath.mockReturnValue({
            path: [
                { type: 'WALK' },
                {
                    type: 'BUS',
                    routeName: 'Route1',
                    headsign: 'To Dest',
                    from: { id: 'OriginStop' },
                    to: { id: 'TransferStop' },
                    departureTime: '10:00'
                },
                {
                    type: 'BUS',
                    routeName: 'Route2',
                    headsign: 'To Dest',
                    from: { id: 'TransferStop' },
                    to: { id: 'DestStop' },
                    departureTime: '10:30'
                },
                { type: 'WALK' }
            ],
            totalEndTime: 700
        });

        // Mock indexes for both routes
        dataLoader.getIndexes.mockReturnValue({
            stopsArray: [],
            routesArray: [{ name: 'Route1' }, { name: 'Route2' }],
            routesByStop: new Map([
                ['OriginStop', [{ routeName: 'Route1', headsign: 'To Dest', stopsSequence: ['OriginStop', 'TransferStop'] }]],
                ['TransferStop', [{ routeName: 'Route2', headsign: 'To Dest', stopsSequence: ['TransferStop', 'DestStop'] }]]
            ])
        });

        const result = await directions.getDirections(0, 0, null, 'DestLoc', '09:55');

        expect(result).toBeDefined();
        // Check mock response pass-through (it now returns busLegs array)
        expect(result.busLegs[0].route.routeName).toBe('Route1');
        expect(result.busLegs[1].route.routeName).toBe('Route2');
    });

    test('returns walk only if A* returns no bus legs', async () => {
        routingEngine.findOptimalPath.mockReturnValue({
            path: [{ type: 'WALK' }],
            totalEndTime: 100
        });

        const result = await directions.getDirections(0, 0, null, 'DestLoc', '09:55');

        expect(result.type).toBe('WALK_ONLY');
    });
});
