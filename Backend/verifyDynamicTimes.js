const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bus.db');

db.serialize(() => {
    // Get a trip ID (e.g., from Route A)
    db.get("SELECT trip_id, headsign FROM trips WHERE headsign LIKE '%Centre Point%' LIMIT 1", (err, row) => {
        if (err) { console.error(err); return; }
        const tripId = row.trip_id;
        console.log(`Checking Trip ID: ${tripId} (${row.headsign})`);

        // Checking stop times for this trip
        db.all("SELECT s.name, st.arrival_time FROM stop_times st JOIN stops s ON st.stop_id = s.id WHERE trip_id = ? ORDER BY sequence", [tripId], (err, rows) => {
            if (err) console.error(err);
            else {
                console.log("Stop Times:");
                rows.forEach(r => console.log(`${r.name}: ${r.arrival_time}`));
            }
        });
    });
});

setTimeout(() => db.close(), 1000);
