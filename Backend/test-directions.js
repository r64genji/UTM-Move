// Test script for directionLogic.js
const { getDirections, findNearestStops, findDirectRoutes, haversineDistance } = require('./directionLogic');

console.log('=== Testing Direction Logic ===\n');

// Test 1: Find nearest stops to CP
console.log('Test 1: Find nearest stops to Centre Point coordinates');
const cpCoords = { lat: 1.559704, lon: 103.634727 };
const nearestToCP = findNearestStops(cpCoords.lat, cpCoords.lon, 3);
console.log('Nearest stops to CP:', nearestToCP.map(s => `${s.name} (${Math.round(s.distance)}m)`));
console.log('');

// Test 2: Direct route from CP to K9
console.log('Test 2: Find direct routes from CP to K9');
const cpToK9 = findDirectRoutes('CP', 'K9');
console.log('Direct routes CP -> K9:', cpToK9.map(r => `${r.routeName} (${r.headsign})`));
console.log('');

// Test 3: Get full directions with GPS coordinates
console.log('Test 3: Get directions from GPS to a destination location');
const result = getDirections(
    1.559704, 103.634727, // Near CP
    null, // No stop ID
    'PERPUSTAKAAN_SULTANAH_ZANARIAH', // PSZ - if exists, otherwise use any location
    '09:00',
    'monday'
);
console.log('Directions result type:', result.type || result.error);
if (result.error) {
    console.log('Error:', result.error);
    console.log('Suggestion:', result.suggestion);
} else {
    console.log('Destination:', result.destination?.name);
    if (result.steps) {
        console.log('Steps:');
        result.steps.forEach((step, i) => {
            console.log(`  ${i + 1}. [${step.type}] ${step.instruction}`);
        });
    }
}
console.log('');

// Test 4: Test with a known location ID from campus_locations
console.log('Test 4: Get directions to K9 (Kolej 9)');
const result2 = getDirections(
    1.559704, 103.634727, // Near CP
    null,
    'K9', // Try K9 as location ID
    '09:00',
    'monday'
);
console.log('Result type:', result2.type || result2.error);
if (result2.steps) {
    console.log('Steps count:', result2.steps.length);
}
console.log('');

// Test 5: Test <100m walking scenario
console.log('Test 5: Test walking-only scenario (close destination)');
// Get a location and simulate being very close
const result3 = getDirections(
    1.559390, 103.632800, // Very close to AM (Arked Meranti)
    null,
    'AM', // Arked Meranti as destination
    '09:00',
    'monday'
);
console.log('Result type:', result3.type || result3.error);
if (result3.type === 'WALK_ONLY') {
    console.log('✅ Correctly identified as WALK_ONLY');
    console.log('Walking distance:', result3.totalWalkingDistance, 'm');
}
console.log('');

console.log('=== Tests Complete ===');
