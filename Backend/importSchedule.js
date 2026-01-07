const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('./bus.db');
const schedulePath = path.join(__dirname, 'schedule.json');
const scheduleData = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
let pendingOperations = 0;
let stmtRoute, stmtCalendar, stmtTrip, stmtStopTime;

db.serialize(() => {
    console.log("Starting import...");

    // 1. Clear existing data
    db.run("DELETE FROM stop_times");
    db.run("DELETE FROM trips");
    db.run("DELETE FROM calendar");
    db.run("DELETE FROM routes");
    db.run("DELETE FROM stops");

    // 2. Import Stops
    const stmtStop = db.prepare("INSERT INTO stops (id, name, lat, lon) VALUES (?, ?, ?, ?)");
    scheduleData.stops.forEach(stop => {
        stmtStop.run(stop.id, stop.name, stop.lat, stop.lon);
    });
    stmtStop.finalize();
    console.log(`Imported ${scheduleData.stops.length} stops.`);

    // Prepare statements
    // Prepare statements (Global scope needed for finalization)
    stmtRoute = db.prepare("INSERT INTO routes (name) VALUES (?)");
    stmtCalendar = db.prepare(`
        INSERT OR IGNORE INTO calendar (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmtTrip = db.prepare("INSERT INTO trips (route_id, service_id, headsign) VALUES (?, ?, ?)");
    stmtStopTime = db.prepare("INSERT INTO stop_times (trip_id, stop_id, arrival_time, sequence) VALUES (?, ?, ?, ?)");

    // Helper to map day names to 0/1
    function getDayFlags(daysArray) {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        return days.map(d => daysArray.includes(d) ? 1 : 0);
    }

    // Helper to add minutes to HH:MM time
    function addMinutes(time, minsToAdd) {
        const [h, m] = time.split(':').map(Number);
        const date = new Date();
        date.setHours(h, m + minsToAdd, 0, 0);
        const newH = String(date.getHours()).padStart(2, '0');
        const newM = String(date.getMinutes()).padStart(2, '0');
        return `${newH}:${newM}`;
    }

    function addSeconds(time, secondsToAdd) {
        const [h, m] = time.split(':').map(Number);
        const date = new Date();
        date.setHours(h, m, 0, 0);
        date.setSeconds(date.getSeconds() + secondsToAdd);
        // Round to nearest minute
        if (date.getSeconds() >= 30) {
            date.setMinutes(date.getMinutes() + 1);
        }
        const newH = String(date.getHours()).padStart(2, '0');
        const newM = String(date.getMinutes()).padStart(2, '0');
        return `${newH}:${newM}`;
    }

    let routeDurations = {};
    try {
        const routeDurationsPath = path.join(__dirname, 'route_durations.json');
        if (fs.existsSync(routeDurationsPath)) {
            routeDurations = JSON.parse(fs.readFileSync(routeDurationsPath, 'utf8'));
            console.log("Loaded route_durations.json");
        } else {
            console.warn("route_durations.json not found, using default timings");
        }
    } catch (e) {
        console.warn("Error loading route_durations.json", e.message);
    }

    scheduleData.routes.forEach((route) => {
        // Insert Route - Use callback to get ID
        pendingOperations++;
        stmtRoute.run(route.name, function (err) {
            if (err) console.error("Route Insert Error:", err);
            const routeId = this.lastID; // The ACTUAL route ID in DB

            if (route.services) {
                route.services.forEach(service => {
                    // Insert Calendar (Service)
                    const flags = getDayFlags(service.days);
                    stmtCalendar.run(service.service_id, ...flags);

                    // Insert Trips
                    service.trips.forEach(trip => {
                        // Always treat 'times' as Trip Start Times (User Request)
                        trip.times.forEach(startTime => {
                            pendingOperations++;
                            stmtTrip.run(routeId, service.service_id, trip.headsign, function (err) {
                                if (err) console.error(err);
                                const tripId = this.lastID;

                                const key = `${route.name}_${trip.headsign}`;
                                const durationData = routeDurations[key];
                                let cumulativeSecs = 0;

                                trip.stops_sequence.forEach((stopId, idx) => {
                                    if (idx > 0 && durationData && durationData.segments && durationData.segments[idx - 1]) {
                                        cumulativeSecs += durationData.segments[idx - 1].totalSecs;
                                    }

                                    const time = addSeconds(startTime, cumulativeSecs);
                                    stmtStopTime.run(tripId, stopId, time, idx + 1);
                                });

                                pendingOperations--;
                                checkDone();
                            });
                        });
                    });
                });
            }
            pendingOperations--;
            checkDone();
        });
    });

    console.log("Import scheduled.");
});



let isDone = false;
function checkDone() {
    if (pendingOperations === 0 && !isDone) {
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
        isDone = true;
        // Wait a slight delay for final insertions to clear
        setTimeout(() => {
            console.log("Finalizing...");
            stmtRoute.finalize();
            stmtCalendar.finalize();
            stmtTrip.finalize();
            stmtStopTime.finalize();

            console.log("Closing DB connection...");
            db.close((err) => {
                if (err) console.error("Error closing:", err);
                else console.log("DB Closed cleanly.");
            });
        }, 1000);
    }
}

// Fallback in case no pending operations (e.g. empty file)
let fallbackTimeout = setTimeout(() => {
    if (pendingOperations === 0) checkDone();
}, 2000);
