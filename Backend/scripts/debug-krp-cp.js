const logic = require('./directionLogic');

console.log("--- Routes from KRP to CP ---");
const routes = logic.findDirectRoutes('KRP', 'CP');

routes.forEach(r => {
    console.log(`Route: ${r.routeName}`);
    console.log(`Headsign: ${r.headsign}`);
    const key = `${r.routeName} : ${r.headsign}`;
    console.log(`Expected Key: ${key}`);
});
