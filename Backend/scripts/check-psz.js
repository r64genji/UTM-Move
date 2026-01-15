// check-psz.js
const data = require('./campus_locations.json');
const loc = data.locations.find(x => x.id === 'PERPUSTAKAAN_SULTANAH_ZANARIAH');
console.log('PSZ location:', loc);
