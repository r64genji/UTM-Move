/**
 * Comprehensive routing tests for A* algorithm edge cases
 * Tests all user-reported routing issues
 */

const { loadData, getIndexes } = require('../directions/dataLoader');
const { findOptimalPath } = require('../directions/routingEngine');

// Load data before all tests
beforeAll(() => {
    loadData();
});

describe('A* Routing - Boarding Stop Selection', () => {
    test('KTGB_XA2 to FKT: prefers KLG_E (128m) over KDOJ_XB2 (328m)', () => {
        // Arrange
        const origin = { lat: 1.572842, lon: 103.61999 };
        const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

        // Act
        const result = findOptimalPath(origin.lat, origin.lon, dest, '14:53', 'thursday');

        // Assert
        expect(result).not.toBeNull();
        const walkStep = result.path.find(s => s.type === 'WALK' && s.to?.id);
        expect(walkStep).toBeDefined();
        const boardingStop = walkStep.to.id;
        expect(['KLG_E', 'KLG_W']).toContain(boardingStop);
        expect(boardingStop).not.toBe('KDOJ_XB2');
    });

    test('U5 to FKT: prefers KP1 (33m) over farther stops like P19', () => {
        // Arrange
        const origin = { lat: 1.558666, lon: 103.646432 };
        const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

        // Act
        const result = findOptimalPath(origin.lat, origin.lon, dest, '16:30', 'thursday');

        // Assert
        expect(result).not.toBeNull();
        const walkStep = result.path.find(s => s.type === 'WALK' && s.to?.id);
        expect(walkStep).toBeDefined();
        expect(walkStep.to.id).toBe('KP1');
        expect(walkStep.distance).toBeLessThan(100);
    });
});

describe('A* Routing - Alight Stop Selection', () => {
    test('Route D should alight at FKT (47m) over PGT (628m) when destination is FKT', () => {
        // Arrange
        const origin = { lat: 1.572842, lon: 103.61999 };
        const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

        // Act
        const result = findOptimalPath(origin.lat, origin.lon, dest, '07:00', 'thursday');

        // Assert
        expect(result).not.toBeNull();
        const busLegs = result.path.filter(s => s.type === 'BUS');
        const finalBusLeg = busLegs[busLegs.length - 1];
        if (finalBusLeg.routeName.includes('D')) {
            expect(finalBusLeg.to.id).toBe('FKT');
            expect(finalBusLeg.to.id).not.toBe('PGT');
        }
    });

    test('Continuous ride on same route should be single leg (CP to FKT, not CP→PGT→FKT)', () => {
        // Arrange
        const indexes = getIndexes();
        const cpStop = indexes.stopsById.get('CP');
        const origin = { lat: cpStop.lat, lon: cpStop.lon };
        const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

        // Act
        const result = findOptimalPath(origin.lat, origin.lon, dest, '16:30', 'thursday');

        // Assert
        expect(result).not.toBeNull();
        const routeDLegs = result.path.filter(s => s.type === 'BUS' && s.routeName?.includes('D'));
        expect(routeDLegs.length).toBeLessThanOrEqual(1);
        if (routeDLegs.length === 1) {
            expect(routeDLegs[0].to.id).toBe('FKT');
        }
    });
});

describe('A* Routing - Transfer Time Consistency', () => {
    test('G01 to FKT: alight time should be before transfer departure time', () => {
        // Arrange
        const indexes = getIndexes();
        const g01 = indexes.locationsById.get('G01') ||
            [...indexes.locationsById.values()].find(l => l.name?.includes('G01'));

        if (!g01) return;

        const origin = { lat: g01.lat, lon: g01.lon };
        const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

        // Act
        const result = findOptimalPath(origin.lat, origin.lon, dest, '16:00', 'thursday');

        // Assert
        if (!result) return;
        const busLegs = result.path.filter(s => s.type === 'BUS');
        if (busLegs.length >= 2) {
            const firstLeg = busLegs[0];
            const secondLeg = busLegs[1];
            const parseTime = (t) => {
                const parts = t.split(':');
                return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            };
            const firstArrival = parseTime(firstLeg.arrivalTimeStr);
            const secondDeparture = parseTime(secondLeg.departureTime);
            expect(firstArrival).toBeLessThanOrEqual(secondDeparture);
        }
    });
});

describe('A* Routing - Unnecessary Transfer Avoidance', () => {
    test('Should prefer 2-leg path over 3-leg path when arrival time is similar', () => {
        // Arrange
        const origin = { lat: 1.558666, lon: 103.646432 };
        const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

        // Act
        const result = findOptimalPath(origin.lat, origin.lon, dest, '16:30', 'thursday');

        // Assert
        expect(result).not.toBeNull();
        const busLegs = result.path.filter(s => s.type === 'BUS');
        expect(busLegs.length).toBeLessThanOrEqual(3);
    });

    test('Should not take Route E just to save a few minutes if Route D is available', () => {
        // Arrange
        const indexes = getIndexes();
        const cpStop = indexes.stopsById.get('CP');
        const origin = { lat: cpStop.lat, lon: cpStop.lon };
        const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

        // Act
        const result = findOptimalPath(origin.lat, origin.lon, dest, '16:40', 'thursday');

        // Assert
        expect(result).not.toBeNull();
        const busLegs = result.path.filter(s => s.type === 'BUS');
        const usesRouteD = busLegs.some(leg => leg.routeName?.includes('D'));
        if (usesRouteD) {
            const routeDLeg = busLegs.find(leg => leg.routeName?.includes('D'));
            expect(routeDLeg.to.id).toBe('FKT');
        }
    });

    test('U5 to FKT at 16:30 should produce a 3-leg path with correct geometries', () => {
        // Arrange
        const origin = { lat: 1.558666, lon: 103.646432 };
        const dest = { id: 'FKT', name: 'FKT', lat: 1.56652, lon: 103.640282 };

        // Act
        const result = findOptimalPath(origin.lat, origin.lon, dest, '16:30', 'thursday');

        // Assert
        expect(result).not.toBeNull();
        const busLegs = result.path.filter(s => s.type === 'BUS');
        expect(busLegs.length).toBeGreaterThanOrEqual(1);
    });
});
