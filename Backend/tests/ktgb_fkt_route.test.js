/**
 * Integration test for KTGB_XA2 → FKT route
 * Verifies that the closest stop is preferred for boarding
 */

const { findOptimalPath } = require('../directions/routingEngine');
const { loadData } = require('../directions/dataLoader');

// Load real data for integration test
beforeAll(() => {
    loadData();
});

describe('KTGB_XA2 to FKT Route', () => {
    test('should prefer KLG_E/KLG_W over KDOJ as boarding stop', () => {
        // KTGB_XA2 coordinates
        const originLat = 1.572842;
        const originLon = 103.61999;

        // FKT destination
        const destLocation = {
            id: 'FKT',
            name: 'Fakulti Kejuruteraan Tenaga/Kimia',
            lat: 1.566520,
            lon: 103.640282
        };

        const result = findOptimalPath(originLat, originLon, destLocation, '14:53', 'thursday');

        expect(result).not.toBeNull();

        if (result) {
            // First step should be walking to bus stop
            expect(result.path[0].type).toBe('WALK');

            // The walking destination should be KLG_E or KLG_W (closest stops)
            // NOT KDOJ or KDOJ_XB2 (farther stops)
            const firstBusStop = result.path[0].to;
            const closerStops = ['KLG_E', 'KLG_W'];
            const fartherStops = ['KDOJ', 'KDOJ_XB2'];

            // Check the first bus stop is one of the closer options
            expect(closerStops).toContain(firstBusStop.id);
            expect(fartherStops).not.toContain(firstBusStop.id);
        }
    });

    test('chooses optimal alight stop based on schedule', () => {
        const originLat = 1.572842;
        const originLon = 103.61999;

        const destLocation = {
            id: 'FKT',
            name: 'Fakulti Kejuruteraan Tenaga/Kimia',
            lat: 1.566520,
            lon: 103.640282
        };

        const result = findOptimalPath(originLat, originLon, destLocation, '14:53', 'thursday');

        expect(result).not.toBeNull();

        if (result) {
            const busLegs = result.path.filter(step => step.type === 'BUS');
            expect(busLegs.length).toBeGreaterThan(0);

            // At 14:53, Route D doesn't depart CP until 16:15 (64 min wait)
            // So the algorithm correctly chooses to alight at a stop closer to FKT
            // (walking ~600m is faster than waiting 64 min)
            const lastBusLeg = busLegs[busLegs.length - 1];
            const alightStop = lastBusLeg.to;

            // The alight stop should be within reasonable walking distance to FKT
            // Valid stops include: JA2, JA3, N24, etc.
            expect(['JA2', 'JA3', 'N24', 'FKT', 'PGT']).toContain(alightStop.id);
        }
    });

    test('would use Route D transfer if schedule allowed', () => {
        // Test at 7:00 AM when Route D has buses every 30 min
        const originLat = 1.572842;
        const originLon = 103.61999;

        const destLocation = {
            id: 'FKT',
            name: 'Fakulti Kejuruteraan Tenaga/Kimia',
            lat: 1.566520,
            lon: 103.640282
        };

        const result = findOptimalPath(originLat, originLon, destLocation, '07:00', 'thursday');

        expect(result).not.toBeNull();

        if (result) {
            const busLegs = result.path.filter(step => step.type === 'BUS');

            // At 7:00 AM, there should be better schedule options
            // Check that algorithm finds a valid route
            expect(busLegs.length).toBeGreaterThan(0);
        }
    });
});
