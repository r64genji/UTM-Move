// test-smart-transfer.js
const { getDirections } = require('./directionLogic');

// Scenario:
// User is at "Arked Meranti" location (nearest stop: CP)
// Destination is K9 (nearest stop: K9)
// BUT user manually selected "AM" (Arked Meranti Stop) as start point.
// AM stop might not have route to K9 directly (Route E goes via CP, not AM in that direction?)
// Let's see if it suggests walking to CP or another stop.

// Actually, checking schedule:
// Route E (To K9/10) stops: ... -> CP -> ... -> K9
// It does NOT stop at AM.
// So if user starts at AM, they should walk to CP.

console.log('\n=== Test 4: Start at AM stop -> K9 (Should suggest walking to CP) ===');
const result4 = getDirections(null, null, 'AM', 'K9', '08:00', 'saturday');

// Should find a BUS_ROUTE starting from CP (or another valid stop), with a walk step first
console.log(JSON.stringify(result4, null, 2));

if (result4.type === 'BUS_ROUTE' && result4.summary.boardAt !== 'Arked Meranti') {
    console.log('\nSUCCESS: Suggested walking to different stop:', result4.summary.boardAt);
    console.log(`Walk distance to board: ${result4.totalWalkingDistance - result4.walkFromAlightDist}m`); // Estimate walk to board
} else {
    console.log('\nResult type:', result4.type);
}
