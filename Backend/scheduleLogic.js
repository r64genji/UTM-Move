// scheduleLogic.js
const sqlite3 = require('sqlite3').verbose();

// Open the database
const db = new sqlite3.Database('./bus.db');

// getNextBus used to be simple (Route + Time).
// Now we need to support Route + Stop + Time (or just Route + Time for the first stop).
// For backward compatibility / simple testing, let's assume if no stop is provided, we check the *first* stop of the route?
// Or better, let's update the function signature to be more flexible.


/**
 * Finds the next bus for a given route and stop.
 * @param {string} routeNameOrId - The name (e.g. 'Route A') or ID of the route.
 * @param {string} userTime - The current time in "HH:MM" format.
 * @param {string} [stopName] - Optional: Specific stop name to check.
 */

// Helper to get day name
function getCurrentDayColumn() {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const now = new Date(); // Use server time, or pass in date
    return days[now.getDay()];
}

function getNextBus(routeNameOrId, userTime, stopName) {
    return new Promise((resolve, reject) => {
        const dayColumn = getCurrentDayColumn();


        // Complex Query:
        // 1. Join stop_times -> trips -> routes
        // 2. Join trips -> calendar
        // 3. Filter by route name/id
        // 4. Filter by calendar[dayColumn] == 1 (Is active today)
        // 5. Filter by time >= userTime
        // 6. Sort by time

        let query = `
            SELECT st.arrival_time, s.name as stop_name, r.name as route_name, t.headsign
            FROM stop_times st
            JOIN trips t ON st.trip_id = t.trip_id
            JOIN routes r ON t.route_id = r.id
            JOIN stops s ON st.stop_id = s.id
            JOIN calendar c ON t.service_id = c.service_id
            WHERE st.arrival_time >= ?
            AND c.${dayColumn} = 1
        `;

        const params = [userTime];

        query += ` AND r.name LIKE ?`;
        params.push(`%${routeNameOrId}%`);

        if (stopName) {
            query += ` AND s.name LIKE ?`;
            params.push(`%${stopName}%`);
        }

        if (dayColumn === 'friday') {
            query += ` AND NOT (st.arrival_time >= '12:40' AND st.arrival_time < '14:00')`;
        }

        query += ` ORDER BY st.arrival_time ASC LIMIT 1`;

        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
            } else if (row) {
                resolve({
                    time: row.arrival_time,
                    stop: row.stop_name,
                    route: row.route_name,
                    headsign: row.headsign
                });
            } else {
                resolve(null); // No bus found
            }
        });
    });
}


function closeDb() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) {
                console.error('Error closing database', err.message);
                reject(err);
            } else {
                console.log('Database connection closed.');
                resolve();
            }
        });
    });
}

module.exports = { getNextBus, closeDb };

