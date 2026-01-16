const { loadData } = require('../directions/dataLoader');

describe('Debug Loader', () => {
    test('should load all routes for CP', () => {
        const data = loadData();
        const cpRoutes = data.indexes.routesByStop.get('CP');
        console.log(`[Jest Debug] CP Routes Count: ${cpRoutes ? cpRoutes.length : 0}`);
        if (cpRoutes) {
            cpRoutes.forEach(r => {
                console.log(`[Jest Debug] - ${r.routeName} (${r.headsign}) Index: ${r.stopIndex}`);
            });
        }
    });
});
