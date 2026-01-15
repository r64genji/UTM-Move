// check-cp-k9.js
const fs = require('fs');
const schedule = JSON.parse(fs.readFileSync('schedule.json', 'utf8'));

const fromStop = 'CP'; // Centre Point
const toStop = 'K9';   // Kolej 9

console.log(`Checking routes from ${fromStop} to ${toStop}...`);

schedule.routes.forEach(route => {
    route.services.forEach(service => {
        service.trips.forEach(trip => {
            const startIdx = trip.stops_sequence.indexOf(fromStop);
            const endIdx = trip.stops_sequence.indexOf(toStop);

            if (startIdx !== -1 && endIdx !== -1) {
                if (startIdx < endIdx) {
                    console.log(`FOUND: ${route.name} (${trip.headsign})`);
                    console.log(`- Service Days: ${service.days.join(', ')}`);
                    console.log(`- Sequence: ${trip.stops_sequence.join(' -> ')}`);
                    console.log(`- Stops count: ${endIdx - startIdx}`);
                }
            }
        });
    });
});

// Also check P19A
console.log(`\nChecking routes from P19A to ${toStop}...`);
const fromP19A = 'P19A';
schedule.routes.forEach(route => {
    route.services.forEach(service => {
        service.trips.forEach(trip => {
            const startIdx = trip.stops_sequence.indexOf(fromP19A);
            const endIdx = trip.stops_sequence.indexOf(toStop);

            if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
                console.log(`FOUND: ${route.name} (${trip.headsign})`);
            }
        });
    });
});
