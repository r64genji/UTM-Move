// remove-bus-stops.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'campus_locations.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const originalCount = data.locations.length;

// Filter out bus stops
data.locations = data.locations.filter(loc => {
    const name = loc.name.toLowerCase();

    // Explicitly remove these types
    if (name.includes('bus station') ||
        name.includes('bus parking') ||
        name.includes('terminal bas') ||
        name.includes('terminal taman universiti')) { // External terminal
        return false;
    }

    return true;
});

const newCount = data.locations.length;
const removedCount = originalCount - newCount;

console.log(`Removed ${removedCount} locations.`);
console.log(`Remaining: ${newCount}`);

// Write back to file
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Successfully updated campus_locations.json');
