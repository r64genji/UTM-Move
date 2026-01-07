const logic = require('./directionLogic');
const fs = require('fs');
const geometries = JSON.parse(fs.readFileSync('route_geometries.json', 'utf8'));

console.log("--- Checking Route E Keys ---");
const keys = Object.keys(geometries).filter(k => k.includes('Route E'));
console.log(keys);

// Specifically check for variants that go to CP
console.log("\nSearching for routes to CP...");
keys.forEach(k => {
    if (k.includes('CP') || k.includes('Centre Point')) {
        console.log("MATCH:", k);
    }
});
