const fs = require('fs');
const axios = require('axios');
const path = require('path');

// Load data
const schedule = JSON.parse(fs.readFileSync('schedule.json', 'utf8'));
const geometriesPath = 'route_geometries.json';
const geometries = JSON.parse(fs.readFileSync(geometriesPath, 'utf8'));

// Route to fix: Route F : To KTR(K01)
const routeName = "Route F";
const headsign = "To KTR(K01)";
const geometryKey = "Route F : To KTR(K01)";

// Find trip to get full stop sequence
const route = schedule.routes.find(r => r.name === routeName);
let trip = null;
for (const service of route.services) {
    trip = service.trips.find(t => t.headsign === headsign);
    if (trip) break;
}

if (!trip) {
    console.error("Trip not found!");
    process.exit(1);
}

const stopIds = trip.stops_sequence;
const stopCoords = stopIds.map(id => {
    const s = schedule.stops.find(stop => stop.id === id);
    return `${s.lon},${s.lat}`; // OSRM expects "lon,lat"
});

async function fetchNewGeometry() {
    // Construct OSRM URL with ALL stops as waypoints
    // Use 'foot' profile to force usage of internal roads (shortest path) vs highway (fastest driving)
    // OSRM Public Server: router.project-osrm.org
    const coordsString = stopCoords.join(';');
    const url = `http://router.project-osrm.org/route/v1/walking/${coordsString}?overview=full&geometries=geojson`;

    console.log(`Fetching new geometry from: ${url}`);

    try {
        const response = await axios.get(url);
        if (response.data.routes && response.data.routes.length > 0) {
            const newGeo = response.data.routes[0].geometry;

            // Validate: Check if it looks reasonable (not empty)
            if (newGeo.coordinates.length < 10) {
                console.error("Result geometry too short!");
                return;
            }

            console.log(`Received new geometry with ${newGeo.coordinates.length} points.`);

            // Backup old file
            fs.copyFileSync(geometriesPath, geometriesPath + '.bak');

            // Update field
            geometries[geometryKey] = newGeo;

            // Save
            fs.writeFileSync(geometriesPath, JSON.stringify(geometries, null, 4));
            console.log(`Successfully updated ${geometriesPath}`);

        } else {
            console.error("No route found from OSRM");
        }
    } catch (e) {
        console.error("Error fetching execution:", e.message);
    }
}

fetchNewGeometry();
