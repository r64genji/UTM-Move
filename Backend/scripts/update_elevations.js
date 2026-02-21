/**
 * update_elevations.js - Data Enrichment Utility
 * Fetches elevation data for all stops and locations from GraphHopper
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const GRAPHHOPPER_BASE_URL = process.env.GRAPHHOPPER_URL || 'http://localhost:8989';

async function getElevation(lat, lon) {
    try {
        const params = new URLSearchParams();
        params.append('point', `${lat},${lon}`);
        params.append('point', `${lat},${lon}`);
        params.append('profile', 'foot');
        params.append('points_encoded', 'false');
        params.append('elevation', 'true');

        const response = await axios.get(`${GRAPHHOPPER_BASE_URL}/route`, {
            params: params,
            timeout: 2000
        });

        if (response.data?.paths?.length > 0) {
            // GraphHopper returns points as [lon, lat, elev] or similar depending on version/config
            // We can also check instructions or metadata if points aren't clear
            const path = response.data.paths[0];
            if (path.points && path.points.coordinates && path.points.coordinates.length > 0) {
                const coord = path.points.coordinates[0];
                return coord[2]; // Usually [lon, lat, elev]
            }
        }
    } catch (e) {
        console.warn(`Failed to fetch elevation for ${lat},${lon}: ${e.message}`);
    }
    return null;
}

async function updateData() {
    const schedulePath = path.join(__dirname, '..', 'data', 'schedule.json');
    const locationsPath = path.join(__dirname, '..', 'data', 'campus_locations.json');

    console.log('--- Updating Stops Elevation ---');
    const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
    for (let stop of schedule.stops) {
        if (stop.elevation === undefined) {
            console.log(`Fetching elevation for stop: ${stop.name}...`);
            const elev = await getElevation(stop.lat, stop.lon);
            if (elev !== null) {
                stop.elevation = Math.round(elev * 10) / 10;
            }
            // Add slight delay to avoid overwhelming local GH if needed
            await new Promise(r => setTimeout(r, 50));
        }
    }
    fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 4));

    console.log('--- Updating Locations Elevation ---');
    const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
    for (let loc of locations.locations) {
        if (loc.elevation === undefined) {
            console.log(`Fetching elevation for location: ${loc.name}...`);
            const elev = await getElevation(loc.lat, loc.lon);
            if (elev !== null) {
                loc.elevation = Math.round(elev * 10) / 10;
            }
            await new Promise(r => setTimeout(r, 50));
        }
    }
    fs.writeFileSync(locationsPath, JSON.stringify(locations, null, 2));

    console.log('Done!');
}

updateData().catch(console.error);
