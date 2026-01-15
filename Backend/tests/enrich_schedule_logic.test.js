/**
 * Tests for enrich_schedule_logic.js - Schedule enrichment with arrival offsets
 */

const { enrichSchedule } = require('../enrich_schedule_logic');

// Mock schedule data for testing
const mockScheduleData = {
    stops: [
        { id: 'A', name: 'Stop A', lat: 1.5500, lon: 103.6300 },
        { id: 'B', name: 'Stop B', lat: 1.5510, lon: 103.6320 },
        { id: 'C', name: 'Stop C', lat: 1.5520, lon: 103.6340 }
    ],
    routes: [
        {
            name: 'Route Test',
            services: [
                {
                    service_id: 'WEEKDAY',
                    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                    trips: [
                        {
                            headsign: 'To C',
                            stops_sequence: ['A', 'B', 'C'],
                            times: ['08:00', '09:00', '10:00']
                        },
                        {
                            headsign: 'To A',
                            stops_sequence: ['C', 'B', 'A'],
                            times: ['08:30', '09:30', '10:30']
                        }
                    ]
                }
            ]
        }
    ]
};

// Mock geometries
const mockGeometries = {
    'Route Test : To C': {
        type: 'LineString',
        coordinates: [
            [103.6300, 1.5500],
            [103.6320, 1.5510],
            [103.6340, 1.5520]
        ]
    },
    'Route Test : To A': {
        type: 'LineString',
        coordinates: [
            [103.6340, 1.5520],
            [103.6320, 1.5510],
            [103.6300, 1.5500]
        ]
    }
};

describe('enrichSchedule', () => {
    test('returns enriched schedule data with same structure', () => {
        const enriched = enrichSchedule(mockScheduleData, mockGeometries);

        expect(enriched).toHaveProperty('stops');
        expect(enriched).toHaveProperty('routes');
        expect(enriched.routes.length).toBe(mockScheduleData.routes.length);
    });

    test('adds arrival_offsets to trips', () => {
        const enriched = enrichSchedule(mockScheduleData, mockGeometries);
        const trip = enriched.routes[0].services[0].trips[0];

        expect(trip).toHaveProperty('arrival_offsets');
        expect(Array.isArray(trip.arrival_offsets)).toBe(true);
    });

    test('arrival_offsets has correct length (one per stop)', () => {
        const enriched = enrichSchedule(mockScheduleData, mockGeometries);
        const trip = enriched.routes[0].services[0].trips[0];

        expect(trip.arrival_offsets.length).toBe(trip.stops_sequence.length);
    });

    test('first stop always has offset 0', () => {
        const enriched = enrichSchedule(mockScheduleData, mockGeometries);
        const trip = enriched.routes[0].services[0].trips[0];

        expect(trip.arrival_offsets[0]).toBe(0);
    });

    test('offsets are non-decreasing', () => {
        const enriched = enrichSchedule(mockScheduleData, mockGeometries);
        const trip = enriched.routes[0].services[0].trips[0];

        for (let i = 1; i < trip.arrival_offsets.length; i++) {
            expect(trip.arrival_offsets[i]).toBeGreaterThanOrEqual(trip.arrival_offsets[i - 1]);
        }
    });

    test('adds calculated_duration to trips', () => {
        const enriched = enrichSchedule(mockScheduleData, mockGeometries);
        const trip = enriched.routes[0].services[0].trips[0];

        expect(trip).toHaveProperty('calculated_duration');
        expect(typeof trip.calculated_duration).toBe('number');
    });

    test('handles missing geometry gracefully', () => {
        const enriched = enrichSchedule(mockScheduleData, {});
        const trip = enriched.routes[0].services[0].trips[0];

        // Should still have offsets (fallback calculation)
        expect(trip.arrival_offsets).toBeDefined();
        expect(trip.arrival_offsets.length).toBe(trip.stops_sequence.length);
    });

    test('preserves original stops data', () => {
        const enriched = enrichSchedule(mockScheduleData, mockGeometries);

        expect(enriched.stops).toEqual(mockScheduleData.stops);
    });

    test('preserves trip times', () => {
        const enriched = enrichSchedule(mockScheduleData, mockGeometries);
        const originalTrip = mockScheduleData.routes[0].services[0].trips[0];
        const enrichedTrip = enriched.routes[0].services[0].trips[0];

        expect(enrichedTrip.times).toEqual(originalTrip.times);
    });
});
