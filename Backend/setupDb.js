// setupDb.js
const sqlite3 = require('sqlite3').verbose();

// Connect to 'bus.db'
const db = new sqlite3.Database('./bus.db');

db.serialize(() => {
  // 1. Drop existing tables
  db.run("DROP TABLE IF EXISTS schedules");
  db.run("DROP TABLE IF EXISTS stop_times");
  db.run("DROP TABLE IF EXISTS trips");
  db.run("DROP TABLE IF EXISTS calendar");
  db.run("DROP TABLE IF EXISTS routes");
  db.run("DROP TABLE IF EXISTS stops");

  console.log("Old tables dropped.");

  // 2. Create 'stops' table
  db.run(`
    CREATE TABLE stops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lat REAL,
      lon REAL
    )
  `);

  // 3. Create 'routes' table
  db.run(`
    CREATE TABLE routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);

  // 4. Create 'calendar' table
  db.run(`
    CREATE TABLE calendar (
      service_id TEXT PRIMARY KEY,
      monday INTEGER,
      tuesday INTEGER,
      wednesday INTEGER,
      thursday INTEGER,
      friday INTEGER,
      saturday INTEGER,
      sunday INTEGER
    )
  `);

  // 5. Create 'trips' table
  db.run(`
    CREATE TABLE trips (
      trip_id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER,
      service_id TEXT,
      headsign TEXT,
      FOREIGN KEY(route_id) REFERENCES routes(id),
      FOREIGN KEY(service_id) REFERENCES calendar(service_id)
    )
  `);

  // 6. Create 'stop_times' table
  db.run(`
    CREATE TABLE stop_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER,
      stop_id TEXT,
      arrival_time TEXT,
      sequence INTEGER,
      FOREIGN KEY(trip_id) REFERENCES trips(trip_id),
      FOREIGN KEY(stop_id) REFERENCES stops(id)
    )
  `);

  console.log("New tables (stops, routes, calendar, trips, stop_times) created.");
});

db.close();
