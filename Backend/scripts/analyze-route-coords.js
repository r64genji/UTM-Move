const fs = require('fs');
const schedule = JSON.parse(fs.readFileSync('schedule.json', 'utf8'));

// Sequence from previous response
const stopIds = [
    "KLG_E", "KDSE_E", "PKU_E", "K6", "KTF", "H01", "CP",
    "PGT", "N24", "P19", "P19A", "UI", "KTC_B1E", "K9"
];

console.log('Stop Coordinates for KTGB -> Arked Lestari Route:');
stopIds.forEach(id => {
    const stop = schedule.stops.find(s => s.id === id);
    if (stop) {
        console.log(`${id}: ${stop.lat}, ${stop.lon} (${stop.name})`);
    } else {
        console.log(`${id}: NOT FOUND`);
    }
});
