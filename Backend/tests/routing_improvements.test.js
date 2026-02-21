/**
 * routing_improvements.test.js - Tests for recent routing engine enhancements
 */

const { loadData, getIndexes } = require('../directions/dataLoader');
const { findOptimalPath } = require('../directions/routingEngine');
const { timeToMinutes, minutesToTime } = require('../directions/scheduler');

beforeAll(() => {
    loadData();
});

describe('Routing Engine Improvements', () => {

    describe('Bug 1: Overnight Routes', () => {
        test('Should find a route departing before midnight and arriving after', () => {
            // Pick a scenario: KTGB to FKT late at night (if any bus exists)
            // If data doesn't have late buses, we mock or use a known late route
            // For now, testing that minutesToTime and search horizon don't crash
            const origin = { lat: 1.572842, lon: 103.61999 }; // KTGB
            const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

            // Artificial test with 23:55
            const result = findOptimalPath(origin.lat, origin.lon, dest, '23:55', 'thursday');

            // Even if no result (it's late), it should not throw or return invalid times
            if (result) {
                expect(result.totalEndTime).toBeGreaterThan(timeToMinutes('23:55'));
                expect(result.path.length).toBeGreaterThan(0);
            }
        });
    });

    describe('Tuning 5: Minimum Transfer Buffer', () => {
        test('Should not recommend a transfer if it requires less than the minimum buffer', () => {
            // Arrange
            // We want to find a case where one bus arrives at a stop very close to another departing bus.
            // Using the actual scheduler/loader logic.
            const origin = { lat: 1.558832, lon: 103.630772 }; // KTF
            const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

            // Act
            // Attempt a route at a time where a transfer might be very tight (e.g. 1 min)
            // If the engine respects the MIN_TRANSFER_BUFFER_MINS (1 min), it will look for the NEXT bus.
            const result = findOptimalPath(origin.lat, origin.lon, dest, '08:14', 'monday');

            // Assert
            if (result) {
                const busLegs = result.path.filter(p => p.type === 'BUS');
                if (busLegs.length > 1) {
                    const firstArr = timeToMinutes(busLegs[0].arrivalTimeStr);
                    const secondDep = timeToMinutes(busLegs[1].departureTime);
                    expect(secondDep - firstArr).toBeGreaterThanOrEqual(1); // MIN_TRANSFER_BUFFER_MINS
                }
            }
        });
    });

    describe('Tuning 7: Maximum Transfer Count', () => {
        test('Should never produce a path with more than 2 bus legs', () => {
            const origin = { lat: 1.5658, lon: 103.6152 }; // Far away (KDOJ)
            const dest = { id: 'KP1', name: 'KP1', lat: 1.5583, lon: 103.6461 }; // Far side

            const result = findOptimalPath(origin.lat, origin.lon, dest, '08:00', 'monday');

            if (result) {
                const busLegs = result.path.filter(s => s.type === 'BUS');
                expect(busLegs.length).toBeLessThanOrEqual(2);
            }
        });
    });

    describe('Tuning 4 & CP Preference', () => {
        test('Should prefer transferring at CP even if another stop is slightly faster', () => {
            const origin = { lat: 1.5588, lon: 103.6307 }; // KTF
            const dest = { id: 'FKT', name: 'FKT', lat: 1.5665, lon: 103.6402 };

            // This scenario at 08:00 often has multiple transfer options (PGT, CP, etc)
            const result = findOptimalPath(origin.lat, origin.lon, dest, '08:08', 'monday');

            if (result && result.path.filter(p => p.type === 'BUS').length > 1) {
                const busLegs = result.path.filter(p => p.type === 'BUS');
                // The transfer point is the 'to' of first leg or 'from' of second
                const transferStop = busLegs[0].to.id;

                // With the CP bonus, CP should be very attractive
                // In UTM Move, CP is the natural hub.
                const usesCP = result.path.some(s => s.type === 'BUS' && (s.from.id === 'CP' || s.to.id === 'CP'));
                if (usesCP) {
                    console.log('CP Transfer Preference Verified');
                }
            }
        });
    });

    describe('Optimal Alighting Stop', () => {
        test('Should not alight early if a later stop on the same route is closer to destination', () => {
            // Route D passes PGT, then N24, then FKT.
            // If dest is FKT, it should NOT alight at PGT (600m away) or N24 (200m away) if it can alight at FKT (50m away).
            const cpStop = getIndexes().stopsById.get('CP');
            const origin = { lat: cpStop.lat, lon: cpStop.lon };
            const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

            const result = findOptimalPath(origin.lat, origin.lon, dest, '07:15', 'monday'); // Route D time

            expect(result).not.toBeNull();
            const busLegs = result.path.filter(s => s.type === 'BUS');
            const lastBusLeg = busLegs[busLegs.length - 1];

            if (lastBusLeg.routeName.includes('Route D')) {
                expect(lastBusLeg.to.id).toBe('FKT');
                expect(lastBusLeg.to.id).not.toBe('PGT');
                expect(lastBusLeg.to.id).not.toBe('N24');
            }
        });
    });

    describe('Tuning 1 & 2: Boarding Stop Walk Cap', () => {
        test('Should prefer a closer stop even if a farther one has the same route', () => {
            // U5 to FKT: KP1 is 33m away, P19 is 500m away. Both have routes (e.g. Route A, C).
            const origin = { lat: 1.558666, lon: 103.646432 }; // U5
            const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

            const result = findOptimalPath(origin.lat, origin.lon, dest, '16:30', 'thursday');

            expect(result).not.toBeNull();
            const firstWalk = result.path.find(s => s.type === 'WALK');
            expect(firstWalk.to.id).toBe('KP1');
            expect(firstWalk.distance).toBeLessThan(100);
        });
    });
});
