const fs = require('fs');
const locations = JSON.parse(fs.readFileSync('campus_locations.json', 'utf8')).locations;

const results = locations.filter(l => l.name.includes('9') || l.keywords.some(k => k.includes('9')));
console.log(results.map(r => `${r.id}: ${r.name}`));
