const { loadData, getIndexes } = require('../directions/dataLoader');
const { findOptimalPath } = require('../directions/routingEngine');
const { haversineDistance } = require('../utils/geo');

loadData();

// KTGB Coordinates (approx)
// Stop nearby: KLG_E / KLG_W ? 
// Let's use the coordinates from `campus_locations.json` for "Kolej Tun Ghafar Baba"
const origin = { lat: 1.572242, lon: 103.620665 };
const dest = { id: 'FKT', name: 'Fakulti Kejuruteraan Tenaga/Kimia', lat: 1.56652, lon: 103.640282 };

console.log('--- Debugging KTGB -> FKT ---');
const time = '08:00';
const day = 'tuesday';
console.log(`Time: ${time}, Day: ${day}`);

const result = findOptimalPath(origin.lat, origin.lon, dest, time, day);

if (!result) {
    console.log('No path found!');
} else {
    console.log(`Total Cost: ${result.totalCost.toFixed(2)}`);
    console.log(`Total Time: ${result.path[result.path.length - 1].endTime - 870} mins`); // 14:30 = 870 mins

    result.path.forEach((step, i) => {
        if (step.type === 'WALK') {
            console.log(`${i + 1}. WALK: ${step.from.name || step.from.id} -> ${step.to.name || step.to.id} (${Math.round(step.distance)}m, ${step.duration.toFixed(1)} min)`);
        } else {
            console.log(`${i + 1}. BUS: ${step.routeName} (${step.headsign})`);
            console.log(`    From: ${step.from.id} @ ${step.departureTime}`);
            console.log(`    To:   ${step.to.id} @ ${step.arrivalTimeStr}`);
        }
    });

    // Check specific conditions
    if (result.path.length > 0) {
        const firstWalk = result.path[0];
        if (firstWalk.type === 'WALK' && firstWalk.to) {
            console.log(`\nBoarding Stop: ${firstWalk.to.id} (Distance: ${Math.round(firstWalk.distance)}m)`);
        }

        const transfers = result.path.filter(s => s.type === 'BUS').length - 1;
        if (transfers > 0) {
            console.log(`Transfers: ${transfers}`);
            const busLegs = result.path.filter(s => s.type === 'BUS');
            for (let i = 0; i < busLegs.length - 1; i++) {
                console.log(`Transfer at: ${busLegs[i].to.id}`);
            }
        } else {
            console.log('Direct Bus (No Transfer)');
        }
    }
}
