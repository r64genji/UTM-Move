const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bus.db');

db.serialize(() => {
    const query = `
        SELECT *
        FROM stop_times st
        LEFT JOIN trips t ON st.trip_id = t.trip_id
        LEFT JOIN calendar c ON t.service_id = c.service_id
        LEFT JOIN stops s ON st.stop_id = s.id
    `;

    console.log("--- Routes ---");
    db.each("SELECT * FROM routes", (err, row) => {
        console.log(row);
    });
});

setTimeout(() => db.close(), 1000);
