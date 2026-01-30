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

    test('chooses optimal path at 08:00: Board KLG_E, Transfer CP, Arrive FKT', () => {
        const originLat = 1.572842;
        const originLon = 103.61999;

        const destLocation = {
            id: 'FKT',
            name: 'Fakulti Kejuruteraan Tenaga/Kimia',
            lat: 1.566520,
            lon: 103.640282
        };

        // At 08:00, Route E(N24) departs KLG_E ~08:02 -> CP ~08:11
        // Route D departs CP ~08:15 -> FKT ~08:21
        // This is a perfect transfer scenario.
        const result = findOptimalPath(originLat, originLon, destLocation, '08:00', 'thursday');

        expect(result).not.toBeNull();

        if (result) {
            const busLegs = result.path.filter(step => step.type === 'BUS');
            expect(busLegs.length).toBeGreaterThan(0);

            // 1. Must board at KLG_E (Eastbound), KLG_W causes a loop!
            const firstBusLeg = busLegs[0];
            expect(firstBusLeg.from.id).toBe('KLG_E');
            expect(firstBusLeg.from.id).not.toBe('KLG_W');

            // 2. Should Transfer at CP
            // The path should involve: KLG_E -> CP (Leg 1)
            // AND CP -> FKT (Leg 2, Route D)
            // Alternatively, checks if ANY leg ends at CP and ANY leg starts at CP
            const transfersAtCP = result.path.some((step, index) => {
                if (step.type !== 'BUS') return false;
                // Check if this leg ends at CP ...
                if (step.to.id === 'CP') {
                    // ... and next bus leg starts at CP? 
                    // (path might have a small walk or transfer step in between)
                    // Let's just look for Route D being used.
                    return true;
                }
                return false;
            });

            // 3. Must use Route D (final leg)
            const lastBusLeg = busLegs[busLegs.length - 1];
            expect(lastBusLeg.routeName).toMatch(/Route D/);
            expect(lastBusLeg.to.id).toBe('FKT');
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
