const { loadData } = require('./directions/dataLoader');

const data = loadData();
const cpRoutes = data.indexes.routesByStop.get('CP');

console.log('Routes for CP:', cpRoutes.length);
cpRoutes.forEach(r => {
    console.log(`- ${r.routeName} (${r.headsign}) Index: ${r.stopIndex}`);
});
