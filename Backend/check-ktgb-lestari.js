const fs = require('fs');
const locations = JSON.parse(fs.readFileSync('campus_locations.json', 'utf8')).locations;
const schedule = JSON.parse(fs.readFileSync('schedule.json', 'utf8'));

const loc1 = locations.find(l => l.id === 'KTGB_XA1');
const loc2 = locations.find(l => l.id === 'ARKED_LESTARI_UA4');

console.log('Origin:', loc1);
console.log('Destination:', loc2);

const startStop = loc1.nearestStop;
const endStop = loc2.nearestStop;

console.log(`Route: ${startStop} -> ${endStop}`);

schedule.routes.forEach(route => {
    route.services.forEach(service => {
        service.trips.forEach(trip => {
            const startIdx = trip.stops_sequence.indexOf(startStop);
            const endIdx = trip.stops_sequence.indexOf(endStop);

            if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
                console.log(`FOUND: ${route.name} (${trip.headsign})`);
                console.log(`- Sequence: ${trip.stops_sequence.slice(startIdx, endIdx + 1).join(' -> ')}`);
            }
        });
    });
});
