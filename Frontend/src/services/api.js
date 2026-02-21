/**
 * api.js - Frontend-only data layer
 * Loads static data from /public/data/ JSON files bundled with the app.
 * No backend required.
 */

let _staticDataCache = null;

/**
 * Load and cache all static data from bundled JSON files
 */
export const fetchStaticData = async () => {
    if (_staticDataCache) return _staticDataCache;

    const [schedule, locations, geometries] = await Promise.all([
        fetch('/data/schedule.json').then(r => r.json()),
        fetch('/data/campus_locations.json').then(r => r.json()),
        fetch('/data/route_geometries.json').then(r => r.json()),
    ]);

    _staticDataCache = {
        stops: schedule.stops || [],
        routes: schedule.routes || [],
        locations: locations.locations || [],
        route_geometries: geometries || {}
    };

    return _staticDataCache;
};
