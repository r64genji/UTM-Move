// fixRouteDirection.js
// Reverse the coordinates for Route E(N24) : To K9/10

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'route_geometries.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const key = 'Route E(N24) : To K9/10';

if (data[key]) {
    console.log('Before: First coord:', data[key].coordinates[0]);
    console.log('Before: Last coord:', data[key].coordinates[data[key].coordinates.length - 1]);

    // Reverse the coordinates array
    data[key].coordinates = data[key].coordinates.reverse();

    console.log('\nAfter: First coord:', data[key].coordinates[0]);
    console.log('After: Last coord:', data[key].coordinates[data[key].coordinates.length - 1]);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
    console.log('\n✅ Reversed coordinates for:', key);
} else {
    console.log('❌ Key not found:', key);
}
