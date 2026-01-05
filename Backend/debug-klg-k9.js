const { getDirections } = require('./directionLogic');

const lat = 1.572235; // KTGB XA1
const lon = 103.619482;
const destId = 'ARKED_LESTARI_UA4';

const directions = getDirections(lat, lon, null, destId, "12:00", "monday");

if (directions.error) {
    console.log('Error:', directions.error);
} else {
    console.log('Type:', directions.type);
    if (directions.steps) {
        directions.steps.forEach(step => {
            console.log(`- ${step.type.toUpperCase()}: ${step.instruction}`);
            if (step.type === 'board') {
                console.log(`  Stop: ${step.stopId} (${step.stopName})`);
            }
            if (step.type === 'alight') {
                console.log(`  Stop: ${step.stopId} (${step.stopName})`);
            }
        });
    }
}
