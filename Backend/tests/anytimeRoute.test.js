/**
 * anytimeRoute.test.js - Verification of 'anytime' routing and Route E logic
 */

const { findOptimalPath } = require('../directions/routingEngine');
const { getIndexes } = require('../directions/dataLoader');

// Mock dependencies
jest.mock('../directions/scheduler', () => ({
    timeToMinutes: jest.fn(t => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }),
    minutesToTime: jest.fn(m => {
        const h = Math.floor(m / 60) % 24;
        const min = m % 60;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }),
    getNextDeparture: jest.fn(),
    findNextAvailableBusForRoute: jest.fn(),
    getDynamicOffset: jest.fn(() => 10), // Flat 10 min travel
    DAYS: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
}));

const { getNextDeparture } = require('../directions/scheduler');

jest.mock('../directions/dataLoader', () => ({
    getIndexes: jest.fn()
}));

jest.mock('../utils/geo', () => ({
    haversineDistance: jest.fn(() => 100) // 100m default (reachable)
}));

describe('Anytime Routing & Route E Logic', () => {
    let mockIndexes;

    beforeEach(() => {
        jest.clearAllMocks();
        mockIndexes = {
            stopsById: new Map([
                ['StopA', { id: 'StopA', lat: 1, lon: 1, name: 'Stop A' }],
                ['StopB', { id: 'StopB', lat: 2, lon: 2, name: 'Stop B' }]
            ]),
            stopsArray: [
                { id: 'StopA', lat: 1, lon: 1, name: 'Stop A' },
                { id: 'StopB', lat: 2, lon: 2, name: 'Stop B' }
            ],
            routesByStop: new Map([
                ['StopA', [
                    {
                        routeName: 'Route E',
                        headsign: 'Weekend Only',
                        stopIndex: 0,
                        stopsSequence: ['StopA', 'StopB'],
                        serviceDays: ['saturday', 'sunday'],
                        times: ['08:00']
                    },
                    {
                        routeName: 'Route E',
                        headsign: 'Weekday Only',
                        stopIndex: 0,
                        stopsSequence: ['StopA', 'StopB'],
                        serviceDays: ['monday', 'tuesday'],
                        times: ['08:00']
                    }
                ]]
            ])
        };
        getIndexes.mockReturnValue(mockIndexes);
    });

    test('isAnytime=true bypasses wait time', () => {
        getNextDeparture.mockReturnValue({ time: '08:00', minutesUntil: 0 }); // Mocked for anytime

        const result = findOptimalPath(
            1, 1.001, // Near StopA
            { id: 'StopB', lat: 2, lon: 2 },
            '12:00', // Middle of day
            'monday',
            true // isAnytime
        );

        expect(result).toBeDefined();
        // Check if anytime logic was used (would have found path even if no bus departs after 12:00 in mock)
        expect(getNextDeparture).toHaveBeenCalledWith(
            expect.objectContaining({ headsign: 'Weekday Only' }),
            0,
            '00:00',
            'monday'
        );
    });

    test('Route E filtering on Weekdays', () => {
        const result = findOptimalPath(
            1, 1.001,
            { id: 'StopB', lat: 2, lon: 2 },
            '08:00',
            'monday', // Weekday
            true
        );

        // Should only consider the Weekday trip
        const usedHeadsigns = getNextDeparture.mock.calls.map(call => call[0].headsign);
        expect(usedHeadsigns).toContain('Weekday Only');
        expect(usedHeadsigns).not.toContain('Weekend Only');
    });

    test('Route E filtering on Weekends (shows all)', () => {
        const result = findOptimalPath(
            1, 1.001,
            { id: 'StopB', lat: 2, lon: 2 },
            '08:00',
            'saturday', // Weekend
            true
        );

        const usedHeadsigns = getNextDeparture.mock.calls.map(call => call[0].headsign);
        expect(usedHeadsigns).toContain('Weekday Only');
        expect(usedHeadsigns).toContain('Weekend Only');
    });
});
