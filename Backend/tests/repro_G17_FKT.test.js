/**
 * Reproduction script for G17 to FKT routing
 */

const directions = require('../directions/index');
const { getIndexes } = require('../directions/dataLoader');

// Mock external dependencies but keep logic intact
// We need real data to reproduce this exact case

// Simple mock for walking directions to avoid external API calls
jest.mock('../directions/walkingService', () => ({
    getWalkingDirections: jest.fn().mockResolvedValue({
        steps: [],
        distance: 500,
        duration: 5
    })
}));

describe('G17 to FKT Debug', () => {
    test('should prefer Walk->CP->Bus D over Bus E->JA1->Walk', async () => {
        // G17 Coordinates
        const G17_LAT = 1.558355;
        const G17_LON = 103.630752;

        // FKT ID
        const FKT_ID = 'FKT'; // Location ID (which matches stop ID 'FKT')

        // Run getDirections
        // Time: 08:00 (Morning peak, buses running)
        const result = await directions.getDirections(
            G17_LAT, G17_LON,
            null,
            FKT_ID,
            '08:00',
            'Monday'
        );

        if (result.error) {
            console.error('Error:', result.error);
        } else {
            console.log('Selected Route:', result.route.routeName);
            console.log('Boarding At:', result.originStop.name);
            console.log('Alighting At:', result.destStop.name);
            console.log('Total Score:', result.score);
            // Note: score isn't returned in final object, but we can infer from debug logs if we ran it manually
        }

        // Expectation:
        // Origin Stop should be 'CP' (Walk to CP)
        // Route should be 'Route D'
        // Alight at 'FKT'

        expect(result.originStop.id).toBe('CP');
        expect(result.route.routeName).toBe('Route D');
        expect(result.destStop.id).toBe('FKT');
    });
});
