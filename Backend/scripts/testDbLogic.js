const { getNextBus } = require('./scheduleLogic');

async function test() {
    console.log("Test 1: Route A, 07:00 (Should be NULL on Sunday)");
    const res1 = await getNextBus('Route A', '07:00');
    console.log(res1);

    console.log("\nTest 1.5: Route B, 07:00 (Should be FOUND on Sunday)");
    const res1b = await getNextBus('Route B', '07:00');
    console.log(res1b);

    console.log("\nTest 2: Route A, 07:00 at Specific Stop 'Kolej Tuanku' (was FS)");
    const res2 = await getNextBus('Route A', '07:00', 'Kolej Tuanku');
    console.log(res2);

    console.log("\nTest 3: Late night (Should be null)");
    const res3 = await getNextBus('Route A', '23:00');
    console.log(res3);

    console.log("\nTest 4: Friday Prayer Break Check (Request at 12:39)");
    const res4 = await getNextBus('Route A', '12:39');
    console.log(res4);
}

test();
