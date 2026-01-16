/**
 * update_geometries.js - Incremental Geometry Update Script
 * 
 * Detects new or changed bus routes in schedule.json and fetches
 * updated geometries from OSRM without touching unchanged routes.
 * 
 * Usage: node scripts/update_geometries.js [--dry-run] [--force]
 *   --dry-run   Show what would be updated without making changes
 *   --force     Re-fetch all geometries (ignore manifest)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// --- Configuration ---
const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEDULE_PATH = path.join(DATA_DIR, 'schedule.json');
const GEOMETRIES_PATH = path.join(DATA_DIR, 'route_geometries.json');
const WAYPOINTS_PATH = path.join(DATA_DIR, 'route_waypoints.json');
const MANIFEST_PATH = path.join(DATA_DIR, 'geometry_manifest.json');

const OSRM_BASE_URL = 'http://router.project-osrm.org/route/v1/driving';
const FETCH_DELAY_MS = 1000; // Polite delay between OSRM requests

// --- Utilities ---

/**
 * Compute a SHA256 hash of the stops_sequence array
 */
function computeHash(stopsSequence) {
    const str = JSON.stringify(stopsSequence);
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Load JSON file or return default if it doesn't exist
 */
function loadJson(filePath, defaultValue = {}) {
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return defaultValue;
}

/**
 * Save JSON file with pretty formatting
 */
function saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
}

/**
 * Fetch geometry from OSRM
 */
async function fetchGeometry(routeStops) {
    const coordinates = routeStops.map(s => `${s.lon},${s.lat}`).join(';');
    const url = `${OSRM_BASE_URL}/${coordinates}?overview=full&geometries=geojson`;

    const response = await axios.get(url, { timeout: 30000 });
    if (response.data.code === 'Ok' && response.data.routes.length > 0) {
        return response.data.routes[0].geometry;
    }
    throw new Error(`OSRM returned no route: ${response.data.code}`);
}

// --- Main Logic ---

async function updateGeometries() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const force = args.includes('--force');

    console.log('=== Geometry Update Script ===');
    if (dryRun) console.log('[DRY RUN] No changes will be made.');
    if (force) console.log('[FORCE] Re-fetching all geometries.');

    // 1. Load data
    const schedule = loadJson(SCHEDULE_PATH);
    const geometries = loadJson(GEOMETRIES_PATH);
    const waypoints = loadJson(WAYPOINTS_PATH);
    const manifest = force ? {} : loadJson(MANIFEST_PATH);

    const stopsMap = new Map(schedule.stops.map(s => [s.id, s]));

    // 2. Build list of current routes and their hashes
    const currentRoutes = new Map();
    for (const route of schedule.routes) {
        for (const service of route.services) {
            for (const trip of service.trips) {
                const key = `${route.name} : ${trip.headsign}`;
                const hash = computeHash(trip.stops_sequence);
                const stopsSequence = trip.stops_sequence;

                // Only keep first occurrence (routes may have multiple services)
                if (!currentRoutes.has(key)) {
                    currentRoutes.set(key, { hash, stopsSequence, routeName: route.name, headsign: trip.headsign });
                }
            }
        }
    }

    console.log(`Found ${currentRoutes.size} route/headsign combinations in schedule.json`);

    // 3. Determine which routes need updating
    const toUpdate = [];
    const toDelete = [];

    for (const [key, { hash, stopsSequence, routeName, headsign }] of currentRoutes) {
        const oldHash = manifest[key];

        // If geometry exists but no manifest entry, assume it's up-to-date (preserve existing)
        if (!oldHash && geometries[key] && geometries[key].coordinates && geometries[key].coordinates.length > 0) {
            console.log(`  [SEED] Preserving existing geometry for: ${key}`);
            manifest[key] = hash; // Seed manifest with current hash
            continue;
        }

        if (oldHash !== hash) {
            toUpdate.push({ key, hash, stopsSequence, routeName, headsign, reason: oldHash ? 'CHANGED' : 'NEW' });
        }
    }

    // 4. Find deleted routes (in manifest but not in schedule)
    for (const key of Object.keys(manifest)) {
        if (!currentRoutes.has(key)) {
            toDelete.push(key);
        }
    }

    console.log(`Routes to update: ${toUpdate.length}`);
    console.log(`Routes to delete: ${toDelete.length}`);

    if (toUpdate.length === 0 && toDelete.length === 0) {
        console.log('All geometries are up-to-date!');
        return;
    }

    // 5. Show what will be updated
    for (const { key, reason } of toUpdate) {
        console.log(`  [${reason}] ${key}`);
    }
    for (const key of toDelete) {
        console.log(`  [DELETE] ${key}`);
    }

    if (dryRun) {
        console.log('[DRY RUN] Exiting without changes.');
        return;
    }

    // 6. Fetch new geometries
    for (const { key, hash, stopsSequence, routeName, headsign, reason } of toUpdate) {
        console.log(`Fetching: ${key}...`);

        // Build route stops with waypoints
        const routeStops = [];
        for (const stopId of stopsSequence) {
            const stop = stopsMap.get(stopId);
            if (stop) {
                routeStops.push(stop);

                // Inject waypoints after this stop
                const routeWaypoints = waypoints[key] || [];
                const specificWaypoints = routeWaypoints.filter(wp => wp.afterStopId === stopId);
                for (const wp of specificWaypoints) {
                    routeStops.push({ lat: wp.lat, lon: wp.lon, isWaypoint: true });
                }
            } else {
                console.warn(`  [WARN] Stop not found: ${stopId}`);
            }
        }

        if (routeStops.length < 2) {
            console.warn(`  [SKIP] Not enough stops for ${key}`);
            continue;
        }

        try {
            const geometry = await fetchGeometry(routeStops);
            geometries[key] = geometry;
            manifest[key] = hash;
            console.log(`  [OK] ${key}`);

            // Polite delay
            await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
        } catch (error) {
            console.error(`  [FAIL] ${key}: ${error.message}`);
        }
    }

    // 7. Handle deletions
    for (const key of toDelete) {
        delete geometries[key];
        delete manifest[key];
        console.log(`  [DELETED] ${key}`);
    }

    // 8. Save updated files
    saveJson(GEOMETRIES_PATH, geometries);
    saveJson(MANIFEST_PATH, manifest);

    console.log('=== Update complete ===');
    console.log(`Updated: ${toUpdate.length}, Deleted: ${toDelete.length}`);
}

updateGeometries().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
