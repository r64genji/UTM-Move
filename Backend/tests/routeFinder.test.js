/**
 * Tests for routeFinder.js including new transfer logic
 */

const {
    findRoutesToNearbyStops,
    findTransferCandidates,
    findLoopRoutes,
    findDirectRoutes
} = require('../directions/routeFinder');

// Mock dependencies
jest.mock('../utils/geo', () => ({
    haversineDistance: jest.fn()
}));
const { haversineDistance } = require('../utils/geo');

jest.mock('../directions/dataLoader', () => ({
    getIndexes: jest.fn()
}));
const { getIndexes } = require('../directions/dataLoader');

jest.mock('../directions/locationService', () => ({
    getStopById: jest.fn(id => ({ id, lat: 0, lon: 0 }))
}));

describe('routeFinder', () => {

    describe('findRoutesToNearbyStops', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            const mockRoutes = [
                {
                    routeName: 'RouteA',
                    headsign: 'To Dest',
                    stopsSequence: ['Stop1', 'Stop2', 'Stop3', 'Stop4'],
                    stopIndex: 0 // Origin is Stop1
                }
            ];
            getIndexes.mockReturnValue({
                routesByStop: new Map([['Stop1', mockRoutes]])
            });

            // Mock distances
            // Stop2: 200m, Stop3: 600m, Stop4: 300m
            haversineDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
                // We'll use a hack to identify stops by checking the mock calls logic in application or just rely on sequence
                // For simplicity, let's assume the calling code passes stop objects we can identify
                return 9999;
            });
        });

        test('finds downstream stops within walking distance', () => {
            const stopsById = new Map([
                ['Stop2', { id: 'Stop2', lat: 1, lon: 1 }],
                ['Stop3', { id: 'Stop3', lat: 2, lon: 2 }],
                ['Stop4', { id: 'Stop4', lat: 3, lon: 3 }]
            ]);

            // Mock specific distances
            haversineDistance.mockImplementation((lat, lon) => {
                if (lat === 1) return 200; // Stop2
                if (lat === 2) return 600; // Stop3
                if (lat === 3) return 300; // Stop4
                return 1000;
            });

            const candidates = findRoutesToNearbyStops(
                'Stop1',
                { lat: 10, lon: 10 },
                500, // Max walk 500m
                stopsById
            );

            // Should match Stop2 and Stop4, but NOT Stop3 (too far)
            expect(candidates).toHaveLength(2);

            const stopIds = candidates.map(c => c.destStop.id).sort();
            expect(stopIds).toEqual(['Stop2', 'Stop4']);

            // Verify route structure
            expect(candidates[0].route.originStopIndex).toBe(0);
            expect(candidates[0].route.stopsSequence).toEqual(['Stop1', 'Stop2', 'Stop3', 'Stop4']);
        });

        test('returns empty if no stops within range', () => {
            const stopsById = new Map([
                ['Stop2', { id: 'Stop2', lat: 1, lon: 1 }]
            ]);
            haversineDistance.mockReturnValue(1000); // Too far

            const candidates = findRoutesToNearbyStops('Stop1', { lat: 10, lon: 10 }, 500, stopsById);
            expect(candidates).toHaveLength(0);
        });
    });

    describe('findTransferCandidates', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            // Mock getIndexes to support findDirectRoutes call inside findTransferCandidates
            getIndexes.mockReturnValue({
                routesByStop: new Map([
                    ['Origin', [{
                        routeName: 'Route1',
                        headsign: 'To CP',
                        stopsSequence: ['Origin', 'CP'],
                        stopIndex: 0
                    }]],
                    ['CP', [{
                        routeName: 'Route2',
                        headsign: 'To Dest',
                        stopsSequence: ['CP', 'StopA', 'StopB'],
                        stopIndex: 0
                    }]]
                ]),
                tripsByRoute: new Map() // Empty map for findLoopRoutes to iterate safely
            });
        });

        test('finds valid transfer via CP to nearby stop', () => {
            const stopsById = new Map([
                ['StopB', { id: 'StopB', lat: 2, lon: 2 }]
            ]);

            // Mock distances: StopB is close
            haversineDistance.mockImplementation((lat) => {
                if (lat === 2) return 100; // StopB
                return 1000;
            });

            // CP is in TRANSFER_POINTS by default (imported from module)

            const candidates = findTransferCandidates(
                'Origin',
                { lat: 10, lon: 10 },
                500,
                stopsById
            );

            expect(candidates.length).toBeGreaterThan(0);

            const cand = candidates.find(c => c.transferPoint === 'CP' && c.destStop.id === 'StopB');
            expect(cand).toBeDefined();
            expect(cand.firstLegs.length).toBeGreaterThan(0);
            expect(cand.secondLeg.routeName).toBe('Route2');
        });
    });
});
