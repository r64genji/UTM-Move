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
        let distanceMap;

        beforeEach(() => {
            // Arrange (Shared)
            jest.clearAllMocks();
            distanceMap = new Map();

            const mockRoutes = [
                {
                    routeName: 'RouteA',
                    headsign: 'To Dest',
                    stopsSequence: ['Stop1', 'Stop2', 'Stop3', 'Stop4'],
                    stopIndex: 0
                }
            ];
            getIndexes.mockReturnValue({
                routesByStop: new Map([['Stop1', mockRoutes]])
            });

            haversineDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
                // If we matches specific coordinates, return from map, otherwise 9999
                const key = `${lat1},${lon1}->${lat2},${lon2}`;
                return distanceMap.get(key) || 9999;
            });
        });

        test('finds downstream stops within walking distance', () => {
            // Arrange
            const stopsById = new Map([
                ['Stop2', { id: 'Stop2', lat: 1, lon: 1 }],
                ['Stop3', { id: 'Stop3', lat: 2, lon: 2 }],
                ['Stop4', { id: 'Stop4', lat: 3, lon: 3 }]
            ]);
            const dest = { lat: 10, lon: 10 };

            // Set distances to destination
            distanceMap.set('1,1->10,10', 200); // Stop2
            distanceMap.set('2,2->10,10', 600); // Stop3
            distanceMap.set('3,3->10,10', 300); // Stop4

            // Act
            const candidates = findRoutesToNearbyStops('Stop1', dest, 500, stopsById);

            // Assert
            expect(candidates).toHaveLength(2);
            const stopIds = candidates.map(c => c.destStop.id).sort();
            expect(stopIds).toEqual(['Stop2', 'Stop4']);
            expect(candidates[0].route.originStopIndex).toBe(0);
        });

        test('returns empty if no stops within range', () => {
            // Arrange
            const stopsById = new Map([['Stop2', { id: 'Stop2', lat: 1, lon: 1 }]]);
            distanceMap.set('1,1->10,10', 1000);

            // Act
            const candidates = findRoutesToNearbyStops('Stop1', { lat: 10, lon: 10 }, 500, stopsById);

            // Assert
            expect(candidates).toHaveLength(0);
        });
    });

    describe('findTransferCandidates', () => {
        beforeEach(() => {
            // Arrange (Shared)
            jest.clearAllMocks();
            getIndexes.mockReturnValue({
                routesByStop: new Map([
                    ['Origin', [{ routeName: 'Route1', headsign: 'To CP', stopsSequence: ['Origin', 'CP'], stopIndex: 0 }]],
                    ['CP', [{ routeName: 'Route2', headsign: 'To Dest', stopsSequence: ['CP', 'StopA', 'StopB'], stopIndex: 0 }]]
                ]),
                tripsByRoute: new Map()
            });
        });

        test('finds valid transfer via CP to nearby stop', () => {
            // Arrange
            const stopsById = new Map([['StopB', { id: 'StopB', lat: 2, lon: 2 }]]);
            const dest = { lat: 10, lon: 10 };

            // Mock Distance: StopB is 100m from destination
            haversineDistance.mockImplementation((lat) => (lat === 2 ? 100 : 1000));

            // Act
            const candidates = findTransferCandidates('Origin', dest, 500, stopsById);

            // Assert
            expect(candidates.length).toBeGreaterThan(0);
            const cand = candidates.find(c => c.transferPoint === 'CP' && c.destStop.id === 'StopB');
            expect(cand).toBeDefined();
            expect(cand.secondLeg.routeName).toBe('Route2');
        });
    });
});
