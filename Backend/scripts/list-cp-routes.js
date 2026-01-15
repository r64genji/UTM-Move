const fs = require('fs');
const schedule = JSON.parse(fs.readFileSync('schedule.json', 'utf8'));

console.log("--- Routes Stopping at Centre Point (CP) ---");

const cpRoutes = new Set();

schedule.routes.forEach(route => {
    route.services.forEach(service => {
        service.trips.forEach(trip => {
            if (trip.stops_sequence.includes('CP')) {
                const key = `${route.name} : ${trip.headsign}`;
                cpRoutes.add(key);
            }
        });
    });
});

console.log(Array.from(cpRoutes).sort().join('\n'));
