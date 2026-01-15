// check-stops.js
const data = require('./campus_locations.json');

// Find locations near CP
const cpLocations = data.locations.filter(x => x.nearestStop === 'CP');
console.log('Locations with nearestStop CP:');
cpLocations.slice(0, 5).forEach(l => console.log(`  - ${l.id}: ${l.name}`));

// Find Arked Meranti
const am = data.locations.find(x => x.name.toLowerCase().includes('arked meranti'));
console.log('\nArked Meranti:', am);

// Get PSZ
const psz = data.locations.find(x => x.name.toLowerCase().includes('perpustakaan sultanah'));
console.log('\nPSZ:', psz);
