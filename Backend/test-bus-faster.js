// test-bus-faster.js
const { getDirections } = require('./directionLogic');

// Test 3: KDOJ to K9 (Should prefer bus)
console.log('\n=== Test 3: KDOJ to K9 (Bus Should Be Faster) ===');
const result3 = getDirections(null, null, 'KDOJ', 'K9', '08:00', 'saturday');
console.log(JSON.stringify(result3, null, 2));

if (result3.type === 'BUS_ROUTE') {
    console.log('\nSUCCESS: Recommended BUS_ROUTE');
    console.log(`Bus Duration: ${result3.totalDuration} min`);
    console.log(`Walk Duration (Comparison): ${result3.directWalkDistance / 80} min`);
} else {
    console.log('\nFAILURE: Recommended', result3.type);
}
