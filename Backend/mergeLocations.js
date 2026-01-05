// mergeLocations.js
// Merge curated campus_locations.json with filtered OSM data

const fs = require('fs');
const path = require('path');

// Load files
const curatedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'campus_locations.json'), 'utf8'));
const osmData = JSON.parse(fs.readFileSync(path.join(__dirname, 'osm_locations.json'), 'utf8'));

const curated = curatedData.locations;
const osm = osmData.locations;

console.log(`Curated: ${curated.length} locations`);
console.log(`OSM: ${osm.length} locations`);

// Filter OSM locations - keep only those with meaningful names
const meaningfulOsm = osm.filter(loc => {
    const name = loc.name.toLowerCase();

    // Skip numbered-only names (like "1", "12", "A1", etc.)
    if (/^[a-z]?[0-9]+[a-z]?$/i.test(loc.name.trim())) {
        return false;
    }

    // Skip very short names
    if (loc.name.length < 3) {
        return false;
    }

    // Include if contains meaningful keywords
    const keywords = ['fakulti', 'kolej', 'perpustakaan', 'library', 'masjid', 'mosque',
        'dewan', 'hall', 'stadium', 'pusat', 'centre', 'center', 'clinic',
        'hospital', 'arked', 'cafe', 'canteen', 'office', 'admin',
        'blok', 'block', 'mjiit', 'engineering', 'science', 'computing'];

    for (const kw of keywords) {
        if (name.includes(kw)) return true;
    }

    // Include if name has multiple words (likely a proper name)
    const words = loc.name.trim().split(/\s+/);
    if (words.length >= 2 && words[0].length > 2) {
        return true;
    }

    return false;
});

console.log(`Filtered meaningful OSM: ${meaningfulOsm.length} locations`);

// Track existing curated IDs to avoid duplicates
const curatedIds = new Set(curated.map(l => l.id));
const curatedNames = new Set(curated.map(l => l.name.toLowerCase()));

// Merge: start with curated, add unique OSM entries
const merged = [...curated];
let addedCount = 0;

for (const osmLoc of meaningfulOsm) {
    const nameLower = osmLoc.name.toLowerCase();

    // Skip if name similar to existing
    if (curatedNames.has(nameLower)) continue;

    // Skip if ID exists
    if (curatedIds.has(osmLoc.id)) continue;

    // Clean up the category
    let category = osmLoc.category;
    if (osmLoc.name.toLowerCase().includes('fakulti')) category = 'faculty';
    if (osmLoc.name.toLowerCase().includes('kolej')) category = 'residential';
    if (osmLoc.name.toLowerCase().includes('perpustakaan')) category = 'facility';
    if (osmLoc.name.toLowerCase().includes('library')) category = 'facility';

    merged.push({
        id: osmLoc.id,
        name: osmLoc.name,
        keywords: osmLoc.keywords,
        category: category,
        lat: osmLoc.lat,
        lon: osmLoc.lon,
        nearestStop: osmLoc.nearestStop,
        source: 'osm'
    });

    curatedIds.add(osmLoc.id);
    curatedNames.add(nameLower);
    addedCount++;
}

console.log(`Added ${addedCount} new locations from OSM`);
console.log(`Total merged: ${merged.length} locations`);

// Sort by category then name
merged.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
});

// Write merged file
const output = { locations: merged };
const outputPath = path.join(__dirname, 'campus_locations.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 4));
console.log(`Saved merged locations to ${outputPath}`);

// Print sample of new OSM additions
const osmAdditions = merged.filter(l => l.source === 'osm').slice(0, 15);
if (osmAdditions.length > 0) {
    console.log('\nSample of new locations from OSM:');
    osmAdditions.forEach(l => {
        console.log(`  [${l.category}] ${l.name} -> ${l.nearestStop}`);
    });
}
