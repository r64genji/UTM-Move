const { loadData, getIndexes } = require('../directions/dataLoader');
const { findOptimalPath } = require('../directions/routingEngine');
const { haversineDistance } = require('../utils/geo');

beforeAll(() => {
    loadData();
});

describe('T02 to FKT Routing Strategy', () => {
    test('Should prefer transfer (T02->AM->Walk->CP->D->FKT) over Loop (T02->KDOJ->N24->Walk)', () => {
        // T02
        const origin = { lat: 1.564448, lon: 103.653426 };
        // FKT
        const dest = { id: 'FKT', name: 'Fakulti Kejuruteraan Tenaga/Kimia', lat: 1.56652, lon: 103.640282 };

        // Test at 08:00 Tuesday (Good frequency for both E and D)
        const result = findOptimalPath(origin.lat, origin.lon, dest, '08:00', 'tuesday');

        expect(result).not.toBeNull();

        const path = result.path;
        const busLegs = path.filter(s => s.type === 'BUS');

        console.log('--- Path Summary ---');
        path.forEach(p => {
            if (p.type === 'BUS') console.log(`BUS: ${p.routeName} (${p.from.id} -> ${p.to.id})`);
            if (p.type === 'WALK') console.log(`WALK: ${p.from.id || 'Origin'} -> ${p.to.id || 'Dest'} (${Math.round(p.distance)}m)`);
        });

        // EXPECTATION:
        // 1. Start on Route E (from T02)
        expect(busLegs[0].routeName).toContain('E');

        // 2. Alight at AM or P19A (before the big loop)
        // If it goes to KDOJ, it's looping.
        expect(['AM', 'P19A', 'P19A2']).toContain(busLegs[0].to.id);

        // 3. Walk to CP (Transfer)
        const transferWalk = path.find(s => s.type === 'WALK' && s.to.id === 'CP');
        expect(transferWalk).toBeDefined();

        // 4. Take Route D (from CP to FKT)
        // Route D stops directly at FKT
        const secondBus = busLegs.find(b => b.routeName.includes('D'));
        expect(secondBus).toBeDefined();
        expect(secondBus.to.id).toBe('FKT');
    });
});
