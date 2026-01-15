const fs = require('fs');
const path = require('path');
const axios = require('axios');

const schedulePath = path.join(__dirname, 'schedule.json');
const scheduleData = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));

const OSRM_DRIVING_URL = 'http://router.project-osrm.org/route/v1/driving';
const SLOWNESS_FACTOR = 1.0;

async function getDrivingDuration(stops) {
    if (stops.length < 2) return 0;
    const coordinates = stops.map(s => `${s.lon},${s.lat}`).join(';');
    const url = `${OSRM_DRIVING_URL}/${coordinates}?overview=false`;
    try {
        const response = await axios.get(url);
        if (response.data.code === 'Ok' && response.data.routes.length > 0) {
            return response.data.routes[0].duration; // seconds
        }
    } catch (e) {
        console.error("OSRM Error:", e.message);
    }
    return 0;
}

// Helper to parse HH:MM to minutes
function timeToMins(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function minsToTime(totalMins) {
    const h = Math.floor(totalMins / 60);
    const m = Math.round(totalMins % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function run() {
    const output = {}; // per headsign: { segments: [ { from, to, drivingSecs, totalSecs } ], totalDurationMins }

    const stopMap = new Map();
    scheduleData.stops.forEach(s => stopMap.set(s.id, s));

    // Identify unique patterns (Headsigns)
    // We assume all trips with same headsign have same stop sequence
    for (const route of scheduleData.routes) {
        for (const service of route.services) {
            for (const trip of service.trips) {
                const key = `${route.name}_${trip.headsign}`;
                if (output[key]) continue; // Already processed

                console.log(`Processing ${key}...`);
                const stopIds = trip.stops_sequence;
                const stops = stopIds.map(id => stopMap.get(id));

                // 1. Get raw driving times between stops
                const segments = [];
                let totalDrivingSecs = 0;

                // We need segment by segment execution to be precise
                for (let i = 0; i < stops.length - 1; i++) {
                    const pair = [stops[i], stops[i + 1]];
                    const durationSecs = await getDrivingDuration(pair);
                    const adjustedDuration = durationSecs * SLOWNESS_FACTOR;

                    segments.push({
                        from: stops[i].id,
                        to: stops[i + 1].id,
                        drivingSecs: adjustedDuration
                    });
                    totalDrivingSecs += adjustedDuration;
                }

                // 2. Determine "Allocated Time" from schedule
                // Simple version: Find min gap between this trip and *any* subsequent trip of the same service?
                // Or better: try to find a "round trip" duration if possible, or just default to reasonable speed?
                // The user said: "add the time spent at each stop as route time based on schedule.json - (sum of all stop to stop routes)"
                // This implies: AllocatedTime - DrivingTime = TotalDwell.

                // Let's try to infer allocated time from frequency.
                // If trips are 07:00, 07:15 -> 15 mins allocated?
                // If trips are 07:00, 08:00 -> 60 mins allocated?
                // Logic: Take the smallest positive difference between start times as the "implied duration" if it's < 60 mins?

                let sortedTimes = trip.times.map(timeToMins).sort((a, b) => a - b);
                let gaps = [];
                for (let i = 0; i < sortedTimes.length - 1; i++) {
                    gaps.push(sortedTimes[i + 1] - sortedTimes[i]);
                }
                // Filter outlier gaps (e.g. lunch break)
                gaps = gaps.filter(g => g > 0 && g < 120);

                let allocatedMins = 0;
                if (gaps.length > 0) {
                    // Use the most common gap or minimum gap? 
                    // Usually minimum gap implies the cycle time for 1 bus if multiple buses aren't interleaving.
                    // But if multiple buses, gap is smaller.
                    // Let's assume the trip MUST fit in the gap?
                    // Actually, if frequency is 15 mins, the trip usually takes < 15 mins.
                    allocatedMins = Math.min(...gaps);
                } else {
                    // Default if only 1 trip
                    allocatedMins = 30; // Fallback
                }

                // Sanity check: if driving time > allocated time, expand allocated time
                const drivingMins = totalDrivingSecs / 60;
                if (drivingMins > allocatedMins) {
                    allocatedMins = Math.ceil(drivingMins + (stops.length * 1)); // At least 1 min stop
                }

                // 3. Calculate Dwell
                const totalDwellSecs = (allocatedMins * 60) - totalDrivingSecs;
                const dwellPerStop = totalDwellSecs / Math.max(1, segments.length); // Distribute among segments (actually stops)
                // We add dwell to the *segment* duration (travel to node + dwell at node)
                // Technically dwell is at the node. 
                // Let's add dwell to the definition of "time to reach next stop including dwell at previous"?
                // Or "time from prev departure to next departure"?
                // schedule.json usually gives *departure* times.
                // So Duration(A->B) = Drive(A->B) + Dwell(B).
                // Actually, usually it's Drive(A->B) + Dwell(A) if we talk about start-to-start.
                // But simplified: split the slack evenly.

                segments.forEach(seg => {
                    seg.totalSecs = seg.drivingSecs + dwellPerStop;
                });

                output[key] = {
                    allocatedMins,
                    drivingMins,
                    segments
                };
            }
        }
    }

    fs.writeFileSync('route_durations.json', JSON.stringify(output, null, 2));
    console.log('Done. Generated route_durations.json');
}

run();
