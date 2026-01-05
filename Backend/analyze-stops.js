// analyze-stops.js
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('campus_locations.json', 'utf8'));

// Filter for potential bus stops
const busStops = data.locations.filter(loc => {
    const name = loc.name.toLowerCase();
    const keywords = loc.keywords ? loc.keywords.join(' ').toLowerCase() : '';

    return name.includes('bus') ||
        name.includes('stop') ||
        name.includes('station') ||
        name.includes('hentian') ||
        name.includes('terminal') ||
        keywords.includes('bus') ||
        keywords.includes('stop');
});

console.log(`Found ${busStops.length} potential bus stop locations out of ${data.locations.length} total.`);
busStops.forEach(stop => {
    console.log(`- [${stop.id}] ${stop.name} (${stop.category})`);
});
