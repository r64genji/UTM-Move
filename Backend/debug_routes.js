const { findOptimalPath } = require('./directions/routingEngine');
const { loadData, getIndexes } = require('./directions/dataLoader');
const { haversineDistance } = require('./utils/geo');

// Load real data
loadData();

const originCoords = { lat: 1.558772, lon: 103.631364, elevation: 26 }; // G15
const destLocation = { id: 'FKT', lat: 1.56652, lon: 103.640282, elevation: 65, name: 'Faculty of Chemical Engineering' };

console.log('--- Simulation: G15 to Faculty of Chemical Engineering (Anytime) ---');

const result = findOptimalPath(
    originCoords.lat,
    originCoords.lon,
    destLocation,
    '08:00',
    'monday',
    true, // isAnytime
    originCoords.elevation
);

if (result) {
    console.log('Result found!');
    console.log('Total Cost (weighted):', result.totalCost);
    console.log('Total Duration (approx mins):', Math.round(result.totalEndTime - 480));

    console.log('\nSteps:');
    result.path.forEach((step, i) => {
        if (step.type === 'WALK') {
            console.log(`${i}. WALK from ${step.from.id || step.from.name} to ${step.to.id || step.to.name} (${Math.round(step.distance)}m, ${Math.round(step.duration)}min, ascent: ${step.ascent}m)`);
        } else {
            console.log(`${i}. BUS ${step.routeName} from ${step.from.id} to ${step.to.id} (${Math.round(step.duration)}min)`);
        }
    });
} else {
    console.log('No path found.');
}

// Manually evaluate Route D from CP
console.log('\n--- Manual Evaluation: Route D via CP ---');
const indexes = getIndexes();
const cpStop = indexes.stopsById.get('CP');
const fktStop = indexes.stopsById.get('FKT');
const routeD = indexes.routesByStop.get('CP').find(r => r.routeName === 'Route D' && r.headsign.includes('FKT'));

if (routeD) {
    const distToCP = haversineDistance(originCoords.lat, originCoords.lon, cpStop.lat, cpStop.lon);
    const walkToTime = distToCP / 83.33;
    const busTime = 6; // We calculated this: 376s / 60
    const walkFromTime = 0; // FKT is the destination

    // Check direct route bonus
    const nearbyDestStop = fktStop;
    const routesServingDest = new Set();
    const destRoutes = indexes.routesByStop.get('FKT') || [];
    destRoutes.forEach(r => routesServingDest.add(`${r.routeName}:${r.headsign}`));

    const routeKey = `${routeD.routeName}:${routeD.headsign}`;
    const hasDirect = routesServingDest.has(routeKey);
    const reluctance = hasDirect ? 13 * 0.35 : 13;
    const walkPenalty = walkToTime * (reluctance - 1);
    const ascentPenalty = Math.max(0, cpStop.elevation - originCoords.elevation) * 0.5;

    console.log(`Walk to CP: ${Math.round(distToCP)}m, ${Math.round(walkToTime)}min`);
    console.log(`Has Direct Route Bonus: ${hasDirect}`);
    console.log(`Walk Penalty: ${walkPenalty.toFixed(2)}`);
    console.log(`Bus Time: ${busTime}min`);
    console.log(`Total Weighted Cost (Approx): ${(480 + walkToTime + walkPenalty + ascentPenalty + busTime).toFixed(2)}`);
}

