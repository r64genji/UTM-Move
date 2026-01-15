// check-routes.js
const { getDirections } = require('./directionLogic');

// Test: From Arked Meranti to PSZ (CP → JA1)
console.log('\n=== Arked Meranti to PSZ ===');
const result = getDirections(1.559649, 103.633792, null, 'PERPUSTAKAAN_SULTANAH_ZANARIAH', '14:00', 'saturday');
console.log(JSON.stringify(result, null, 2));

// Test: What routes go CP → JA1?
const data = require('./schedule.json');
const routes = data.routes;

console.log('\n=== Routes containing both CP and JA1 ===');
for (const route of routes) {
    for (const service of route.services) {
        if (service.days.includes('saturday')) {
            for (const trip of service.trips) {
                const cpIdx = trip.stops_sequence.indexOf('CP');
                const ja1Idx = trip.stops_sequence.indexOf('JA1');
                if (cpIdx !== -1 && ja1Idx !== -1) {
                    console.log(`${route.name} - ${trip.headsign}: CP at ${cpIdx}, JA1 at ${ja1Idx}`);
                }
            }
        }
    }
}
