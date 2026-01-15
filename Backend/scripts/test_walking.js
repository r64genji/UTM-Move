const { getWalkingDirections } = require('../directions/walkingService');

async function test() {
    // KTF (Stop)
    const origin = { lat: 1.558832, lon: 103.630772 };
    // Same point
    const dest = { lat: 1.558832, lon: 103.630772 };

    console.log('Testing walking directions (0 Distance)...');
    try {
        const result = await getWalkingDirections(origin, dest);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();
