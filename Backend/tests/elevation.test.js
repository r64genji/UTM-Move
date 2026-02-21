/**
 * elevation.test.js - Tests for elevation penalty in routing engine
 */

const {
    scoreRoute,
    isWalkingBetter,
    WALK_ASCENT_PENALTY_FACTOR
} = require('../directions/routingEngine');

// Mock geo and dependencies
jest.mock('../utils/geo', () => ({
    haversineDistance: jest.fn()
}));
const { haversineDistance } = require('../utils/geo');

jest.mock('../directions/dataLoader', () => ({
    getIndexes: jest.fn(() => ({
        stopsArray: []
    }))
}));

jest.mock('../directions/scheduler', () => ({
    getDynamicOffset: jest.fn(() => 0),
    timeToMinutes: jest.fn(t => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    })
}));

describe('Elevation Penalty', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('WALK_ASCENT_PENALTY_FACTOR is 0.5', () => {
        expect(WALK_ASCENT_PENALTY_FACTOR).toBe(0.5);
    });

    describe('scoreRoute', () => {
        test('adds ascent penalty to total score', () => {
            const route = { routeName: 'Bus A' };
            const departure = { minutesUntil: 5 };
            const destStop = { elevation: 10, lat: 1, lon: 1 };
            const destLocation = { elevation: 30, lat: 1.01, lon: 1.01 }; // 20m ascent

            haversineDistance.mockReturnValue(83.33); // 1 min walk

            const result = scoreRoute(route, departure, destStop, destLocation);

            // wait(5) + bus(0) + walk(1) + penalty(20 * 0.5 = 10) = 16
            expect(result.totalScore).toBe(16);
            expect(result.ascentPenalty).toBe(10);
        });

        test('does not penalize descent', () => {
            const route = { routeName: 'Bus A' };
            const departure = { minutesUntil: 5 };
            const destStop = { elevation: 50, lat: 1, lon: 1 };
            const destLocation = { elevation: 10, lat: 1.01, lon: 1.01 }; // 40m descent

            haversineDistance.mockReturnValue(83.33); // 1 min walk

            const result = scoreRoute(route, departure, destStop, destLocation);

            // wait(5) + bus(0) + walk(1) + penalty(0) = 6
            expect(result.totalScore).toBe(6);
            expect(result.ascentPenalty).toBe(0);
        });
    });

    describe('isWalkingBetter', () => {
        test('accounts for elevation in walk-vs-bus comparison', () => {
            const route = { routeName: 'Bus', originStopIndex: 0, destStopIndex: 1 };
            const originCoords = { lat: 1, lon: 1, elevation: 10 };
            const originStop = { lat: 1, lon: 1, elevation: 10 };
            const destStop = { lat: 1.1, lon: 1.1, elevation: 10 };
            const destLocation = { lat: 1.2, lon: 1.2, elevation: 60 }; // 50m ascent from destStop
            const directDistance = 1000;
            const departure = { minutesUntil: 5 };

            haversineDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
                if (lat1 === 1 && lon1 === 1 && lat2 === 1.2 && lon2 === 1.2) return 1000; // direct walk
                if (lat1 === 1 && lon1 === 1 && lat2 === 1 && lon2 === 1) return 0; // walk to origin stop
                if (lat1 === 1.1 && lon1 === 1.1 && lat2 === 1.2 && lon2 === 1.2) return 1000; // walk from dest stop
                return 0;
            });

            // Bus: walkTo(0) + wait(5) + bus(1) + walkFrom(12 mins @ 1000m) + ascentPenalty(50 * 0.5 = 25) = 43 mins
            // Walk: direct(12 mins) + ascentPenalty(60 - 10 = 50 * 0.5 = 25) = 37 mins

            const result = isWalkingBetter(route, originCoords, originStop, destStop, destLocation, directDistance, departure);

            expect(result).toBe(true); // Walking (37) < Bus (43)
        });
    });
});
