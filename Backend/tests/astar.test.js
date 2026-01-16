/**
 * Tests for A* Algorithm
 */

const { findOptimalPath } = require('../directions/routingEngine');
const scheduler = require('../directions/scheduler');
const locationService = require('../directions/locationService');
const dataLoader = require('../directions/dataLoader');

jest.mock('../utils/geo', () => ({
    haversineDistance: jest.fn()
}));
const { haversineDistance } = require('../utils/geo');

jest.mock('../directions/scheduler', () => ({
    timeToMinutes: jest.fn(t => (t ? parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]) : 0)),
    minutesToTime: jest.fn(m => `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`),
    getNextDeparture: jest.fn(),
    getDynamicOffset: jest.fn(() => 0), // 0 travel time by default
    DAYS: ['sunday', 'monday']
}));

jest.mock('../directions/dataLoader', () => ({
    getIndexes: jest.fn()
}));

jest.mock('../directions/locationService', () => ({
    findNearestStopsSync: jest.fn()
}));

describe('A*', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        haversineDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
            // Simple 1D distance logic for testing: abs(lat1-lat2) * 100000
            // Or just mock specific values
            if (lat1 === 0 && lon1 === 0 && lat2 === 0.001) return 100; // Origin -> StopA (100m)
            if (lat1 === 0.002 && lon1 === 0.002 && lat2 === 10) return 200; // StopB -> Dest (200m)
            if (lat1 === 0 && lon1 === 0 && lat2 === 10) return 50000; // Origin -> Dest (Far)
            return 1000;
        });

        // Mock Data
        dataLoader.getIndexes.mockReturnValue({
            stopsArray: [
                { id: 'StopA', lat: 0.001, lon: 0.001 },
                { id: 'StopB', lat: 0.002, lon: 0.002 }
            ],
            stopsById: new Map([
                ['StopA', { id: 'StopA', lat: 0.001, lon: 0.001 }],
                ['StopB', { id: 'StopB', lat: 0.002, lon: 0.002 }]
            ]),
            routesByStop: new Map([
                ['StopA', [{
                    routeName: 'Route1',
                    headsign: 'To B',
                    stopsSequence: ['StopA', 'StopB'],
                    stopIndex: 0
                }]]
            ])
        });
    });

    test('finds path Walk -> Bus -> Walk', () => {
        // Setup:
        // Origin (0,0) -> Walk 100m -> StopA
        // StopA -> Bus (Wait 5m, Travel 10m) -> StopB
        // StopB -> Walk 200m -> Dest (10,10)

        haversineDistance.mockImplementation((lat1, lon1, lat2, lon2) => {
            if (lat1 === 0 && lat2 === 0.001) return 100; // Origin->A
            if (lat1 === 0.002 && lat2 === 10) return 200; // B->Dest
            if (lat1 === 0.001 && lat2 === 10) return 20000; // A->Dest Big
            return 5000;
        });

        // Mock Scheduler
        scheduler.getNextDeparture.mockReturnValue({
            time: '08:05', // requested at 08:00
            minutesUntil: 5
        });
        scheduler.getDynamicOffset.mockImplementation((r, h, idx) => idx * 10); // 10 mins per stop

        const result = findOptimalPath(0, 0, { lat: 10, lon: 10 }, '08:00', 'Monday');

        expect(result).not.toBeNull();
        if (result) {
            expect(result.path.length).toBe(3); // Walk, Bus, Walk
            expect(result.path[0].type).toBe('WALK');
            expect(result.path[1].type).toBe('BUS');
            expect(result.path[2].type).toBe('WALK');

            // Timing Check
            // Start 8:00 (480)
            // Walk 100m @ 84m/min ~= 1.2 min. Arr A @ 481.2
            // Bus Dep 8:05 (485). Wait ~3.8 min.
            // Travel 10 min. Arr B @ 495 (8:15).
            // Walk 200m @ 84m/min ~= 2.4 min. Arr Dest @ 497.4.

            // result.totalEndTime should be around 497.4 (Speed 83.33m/min)
            // 480 (Start) + 1.2 (Walk) + 3.8 (Wait) + 10 (Ride) + 2.4 (Walk) = 497.4
            expect(result.totalEndTime).toBeCloseTo(497.4, 1);
        }
    });

    test('returns null if no path found', () => {
        dataLoader.getIndexes.mockReturnValue({
            stopsArray: [],
            stopsById: new Map(),
            routesByStop: new Map()
        });

        const result = findOptimalPath(0, 0, { lat: 10, lon: 10 }, '08:00', 'Monday');
        expect(result).toBeNull();
    });
});
