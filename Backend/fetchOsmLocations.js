// fetchOsmLocations.js
// Fetches campus buildings and POIs from OpenStreetMap via Overpass API

const https = require('https');
const fs = require('fs');
const path = require('path');

// UTM Johor Bahru campus bounding box
const BBOX = {
    south: 1.538,
    west: 103.618,
    north: 1.578,
    east: 103.658
};

// Overpass QL query for buildings and amenities with names
const query = `
[out:json][timeout:60];
(
  way["building"]["name"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["amenity"]["name"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["amenity"]["name"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out center tags;
`;

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Load existing stops to find nearest
const scheduleData = JSON.parse(fs.readFileSync(path.join(__dirname, 'schedule.json'), 'utf8'));
const stops = scheduleData.stops;

// Haversine distance calculation
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestStop(lat, lon) {
    let nearest = null;
    let minDist = Infinity;
    for (const stop of stops) {
        const d = haversineDistance(lat, lon, stop.lat, stop.lon);
        if (d < minDist) {
            minDist = d;
            nearest = stop.id;
        }
    }
    return nearest;
}

function categorize(tags) {
    if (tags.amenity === 'library') return 'facility';
    if (tags.amenity === 'place_of_worship') return 'facility';
    if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'facility';
    if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') return 'dining';
    if (tags.building === 'university' || tags.building === 'college') return 'academic';
    if (tags.building === 'dormitory' || tags.building === 'residential') return 'residential';
    if (tags.building === 'sports_centre' || tags.leisure) return 'facility';
    return 'building';
}

function generateKeywords(name, tags) {
    const keywords = [];
    // Split name into words
    const words = name.toLowerCase().split(/\s+/);
    keywords.push(...words.filter(w => w.length > 2));

    // Add acronym if multi-word
    if (words.length > 1) {
        const acronym = words.map(w => w[0]).join('');
        if (acronym.length >= 2) keywords.push(acronym);
    }

    // Add amenity type
    if (tags.amenity) keywords.push(tags.amenity);

    return [...new Set(keywords)];
}

function generateId(name) {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 30);
}

async function fetchOverpassData() {
    return new Promise((resolve, reject) => {
        const postData = `data=${encodeURIComponent(query)}`;

        const options = {
            hostname: 'overpass-api.de',
            port: 443,
            path: '/api/interpreter',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        console.log('Fetching data from Overpass API...');

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Failed to parse JSON: ' + e.message));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(postData);
        req.end();
    });
}

async function main() {
    try {
        const osmData = await fetchOverpassData();
        console.log(`Received ${osmData.elements.length} elements from OSM`);

        const locations = [];
        const seenIds = new Set();

        for (const el of osmData.elements) {
            const tags = el.tags || {};
            const name = tags.name;

            if (!name) continue;

            // Get center coordinates
            let lat, lon;
            if (el.type === 'way' && el.center) {
                lat = el.center.lat;
                lon = el.center.lon;
            } else if (el.type === 'node') {
                lat = el.lat;
                lon = el.lon;
            } else {
                continue;
            }

            let id = generateId(name);
            // Ensure unique ID
            let suffix = 1;
            while (seenIds.has(id)) {
                id = generateId(name) + '_' + suffix++;
            }
            seenIds.add(id);

            locations.push({
                id,
                name,
                keywords: generateKeywords(name, tags),
                category: categorize(tags),
                lat: parseFloat(lat.toFixed(6)),
                lon: parseFloat(lon.toFixed(6)),
                nearestStop: findNearestStop(lat, lon),
                osmId: el.id,
                osmType: el.type
            });
        }

        console.log(`Processed ${locations.length} named locations`);

        // Sort by name
        locations.sort((a, b) => a.name.localeCompare(b.name));

        // Write to file
        const output = { locations };
        const outputPath = path.join(__dirname, 'osm_locations.json');
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`Saved to ${outputPath}`);

        // Show sample
        console.log('\nSample locations:');
        locations.slice(0, 10).forEach(loc => {
            console.log(`  - ${loc.name} (${loc.category}) -> nearest stop: ${loc.nearestStop}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
