/**
 * Tests for routeScorer.js
 */

const {
    evaluateCandidates,
    isWalkingBetter,
    scoreRoute,
    getBusTravelMinutes
} = require('../directions/routingEngine');

// Mock scheduler dependencies
jest.mock('../directions/scheduler', () => ({
    getNextDeparture: jest.fn(),
    findNextAvailableBusForRoute: jest.fn(),
    timeToMinutes: jest.fn(t => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }),
    getDynamicOffset: jest.fn()
}));
const { getNextDeparture, findNextAvailableBusForRoute, getDynamicOffset } = require('../directions/scheduler');

// Mock geo
jest.mock('../utils/geo', () => ({
    haversineDistance: jest.fn()
}));
const { haversineDistance } = require('../utils/geo');

describe('routeScorer', () => {
    describe('evaluateCandidates', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            haversineDistance.mockReturnValue(100); // 100m walk
            getDynamicOffset.mockReturnValue(0);
        });

        test('selects route with lowest total score', () => {
            // Setup
            const candidates = [
                {
                    route: { routeName: 'Fast', headsign: 'A', originStopIndex: 0, destStopIndex: 5, isLoop: false },
                    destStop: { id: 'StopA', lat: 1, lon: 1 }
                },
                {
                    route: { routeName: 'Slow', headsign: 'B', originStopIndex: 0, destStopIndex: 5, isLoop: false },
                    destStop: { id: 'StopB', lat: 2, lon: 2 }
                }
            ];

            // Mock departures
            // Fast route: leaves in 5 mins
            getNextDeparture.mockReturnValueOnce({ time: '10:05', minutesUntil: 5 });
            // Slow route: leaves in 20 mins
            getNextDeparture.mockReturnValueOnce({ time: '10:20', minutesUntil: 20 });

            // Mock offsets for travel time
            // Both take 10 mins travel
            getDynamicOffset.mockReturnValue(10); // simplified (destOffset - originOffset)

            const result = evaluateCandidates(candidates, { lat: 0, lon: 0 }, '10:00', 'Monday');

            expect(result.route.routeName).toBe('Fast');
            expect(result.score).toBeLessThan(result.score + 15); // Difference in wait time
        });

        test('handles next day departure', () => {
            const candidates = [{
                route: { routeName: 'Late', headsign: 'A', originStopIndex: 0, destStopIndex: 1, isLoop: false },
                destStop: { id: 'StopA' }
            }];

            // No departure today
            getNextDeparture.mockReturnValue(null);

            // Available next day at 06:00
            findNextAvailableBusForRoute.mockReturnValue({
                time: '06:00',
                tripStartTime: '06:00',
                day: 'Tuesday'
            });

            // Current time 23:00 (1380 mins), Next 06:00 (360 mins) => Diff = 360 - 1380 + 1440 = 420 mins (7 hours)
            const result = evaluateCandidates(candidates, { lat: 0, lon: 0 }, '23:00', 'Monday');

            expect(result.route).toBeDefined();
            expect(result.departure.time).toBe('06:00');
            expect(result.departure.minutesUntil).toBe(420);
        });
    });

    describe('isWalkingBetter', () => {
        test('prefers walking when bus wait and travel is significantly longer than walk', () => {
            // Arrange
            const origin = { lat: 1.55, lon: 103.63 };
            const dest = { lat: 1.551, lon: 103.631 }; // ~150 meters away
            const directDist = 150;

            // Mock walk time for 150m @ ~83m/min = ~1.8 mins
            haversineDistance.mockReturnValue(150);

            // Mock bus wait + travel to be longer (e.g., 5 min wait + 2 min travel = 7 mins)
            getNextDeparture.mockReturnValue({ minutesUntil: 5 });
            getDynamicOffset.mockReturnValue(2);

            // Act
            const result = isWalkingBetter(
                { routeName: 'Bus', originStopIndex: 0, destStopIndex: 1 },
                origin, dest, origin, dest,
                directDist,
                { id: 'Stop', lat: 1.55, lon: 103.63 }
            );

            // Assert
            expect(result).toBe(true);
        });

        test('prefers bus for longer distances even with moderate wait', () => {
            // Arrange
            const origin = { lat: 1.55, lon: 103.63 };
            const dest = { lat: 1.57, lon: 103.65 }; // ~3 kilometers away
            const directDist = 3000;

            haversineDistance.mockReturnValue(3000);

            // Bus: 5 min wait + 10 min travel = 15 mins
            // Walk: 3000m @ 83m/min = ~36 mins
            getNextDeparture.mockReturnValue({ minutesUntil: 5 });
            getDynamicOffset.mockReturnValue(10);

            // Act
            const result = isWalkingBetter(
                { routeName: 'Bus', originStopIndex: 0, destStopIndex: 1 },
                origin, dest, origin, dest,
                directDist,
                { id: 'Stop', lat: 1.55, lon: 103.63 }
            );

            // Assert
            expect(result).toBe(false);
        });
    });
});
