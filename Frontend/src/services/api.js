/**
 * api.js - Frontend-only data layer
 * Loads static data from /public/data/ JSON files bundled with the app.
 * No backend required.
 */

let _coreDataCache = null;
let _routeGeometriesCache = null;
let _staticDataCache = null;

const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response.json();
};

export const fetchCoreData = async () => {
    if (_coreDataCache) return _coreDataCache;

    const [schedule, locations] = await Promise.all([
        fetchJson('/data/schedule.json'),
        fetchJson('/data/campus_locations.json')
    ]);

    _coreDataCache = {
        stops: schedule.stops || [],
        routes: schedule.routes || [],
        locations: locations.locations || []
    };

    return _coreDataCache;
};

export const fetchRouteGeometries = async () => {
    if (_routeGeometriesCache) return _routeGeometriesCache;

    const geometries = await fetchJson('/data/route_geometries.json');
    _routeGeometriesCache = geometries || {};
    return _routeGeometriesCache;
};

/**
 * Load and cache all static data from bundled JSON files
 */
export const fetchStaticData = async () => {
    if (_staticDataCache) return _staticDataCache;

    const [coreData, geometries] = await Promise.all([
        fetchCoreData(),
        fetchRouteGeometries()
    ]);

    _staticDataCache = {
        stops: coreData.stops || [],
        routes: coreData.routes || [],
        locations: coreData.locations || [],
        route_geometries: geometries || {}
    };

    return _staticDataCache;
};
