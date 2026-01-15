const directionLogic = require('./directionLogic');

async function runValidations() {
    console.log("--- Verifying Direction Times ---");

    // Test Case 1: Route A from KP1 to CP (Direct)
    // KP1 (stop id: KP1) -> CP (stop id: CP)
    // Time: 07:30 (Matches verification step from implementation phase)
    // Expected: Bus Duration ~30m

    console.log("\nTestCase 1: KP1 -> CP @ 07:30 (Monday)");
    const result = await directionLogic.getDirections(null, null, 'KP1', 'CP', '07:30', 'monday');

    if (result.error) {
        console.error("Error:", result.error);
    } else {
        console.log("Summary:", result.summary);
        if (result.summary.busArrivalTime && result.summary.totalDuration && result.summary.eta) {
            console.log("SUCCESS: New fields present.");
            console.log(`Bus Arrives: ${result.summary.busArrivalTime}`);
            console.log(`Total Duration: ${Math.round(result.summary.totalDuration)} min`);
            console.log(`ETA: ${result.summary.eta}`);
        } else {
            console.error("FAILURE: Missing new fields.");
        }
    }

    // Test Case 2: Route E Loop (KDOJ -> Cluster)
    // Stops: KDOJ -> T02
    console.log("\nTestCase 2: KDOJ -> T02 (Cluster) @ 08:00 (Monday)");
    const result2 = await directionLogic.getDirections(null, null, 'KDOJ', 'T02', '08:00', 'monday');
    if (result2.error) {
        console.error("Error:", result2.error);
    } else {
        console.log("Summary:", result2.summary);
        console.log(`Bus Arrives: ${result2.summary.busArrivalTime}`);
    }

    // Test Case 3: KDOJ -> CP (Direct, Future Day)
    // User reported missing ETA for this.
    console.log("\nTestCase 3: KDOJ -> CP @ 07:00 (Thursday)");
    // Note: 07:00 is slightly before 07:02 departure
    const result3 = await directionLogic.getDirections(null, null, 'KDOJ', 'CP', '07:00', 'thursday');
    if (result3.error) {
        console.error("Error:", result3.error);
    } else {
        console.log("Summary:", result3.summary);
        if (result3.summary.eta && result3.summary.totalDuration) {
            console.log("SUCCESS: ETA present for future day.");
            console.log(`ETA: ${result3.summary.eta}, Duration: ${result3.summary.totalDuration}`);
        } else {
            console.error("FAILURE: Missing ETA/Duration for future day.");
        }
    }

}

runValidations();
