const fs = require('fs');
const locations = JSON.parse(fs.readFileSync('campus_locations.json', 'utf8')).locations;

const results = locations.map(l => `${l.id}: ${l.name}`);
console.log(results.join('\n'));
