const {
    scoreRoute,
    isWalkingBetter,
    WALK_ASCENT_PENALTY_FACTOR
} = require('./directions/routingEngine');

console.log('WALK_ASCENT_PENALTY_FACTOR:', WALK_ASCENT_PENALTY_FACTOR);

const route = { routeName: 'Bus A' };
const departure = { minutesUntil: 5 };
const destStop = { elevation: 10, lat: 1, lon: 1 };
const destLocation = { elevation: 30, lat: 1.01, lon: 1.01 }; // 20m ascent

const result = scoreRoute(route, departure, destStop, destLocation);
console.log('scoreRoute result:', result);

const routeBus = { routeName: 'Bus', originStopIndex: 0, destStopIndex: 1 };
const originCoords = { lat: 1, lon: 1, elevation: 10 };
const originStop = { lat: 1, lon: 1, elevation: 10 };
const stopDest = { lat: 1.1, lon: 1.1, elevation: 10 };
const locDest = { lat: 1.2, lon: 1.2, elevation: 60 }; // 50m ascent from destStop
const directDist = 1000;
const dep = { minutesUntil: 5 };

console.log('Inputs for isWalkingBetter:');
console.log('routeBus:', routeBus);
console.log('originCoords:', originCoords);
console.log('originStop:', originStop);
console.log('stopDest:', stopDest);
console.log('locDest:', locDest);
console.log('directDist:', directDist);
console.log('dep:', dep);

const resultBetter = isWalkingBetter(routeBus, originCoords, originStop, stopDest, locDest, directDist, dep);
console.log('isWalkingBetter result:', resultBetter);
