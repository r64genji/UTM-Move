import React, { useMemo } from 'react';

// Average Bus Speed in m/s (approx 30km/h)
// Adjust this factor to tune the "Arrival Time" estimation
const BUS_SPEED_MPS = 8.33;
const STOP_DWELL_TIME_SEC = 30; // 30 seconds per stop

// Helper: Haversine Distance (pure function, no need to be inside the component)
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const ScheduleView = ({ service, stops = [], currentHeadsign }) => {
    // Derive display trip and stop list unconditionally (before any hooks)
    const displayTrip = service
        ? (service.trips.find(t => t.headsign === currentHeadsign) || service.trips[0])
        : null;
    const stopIds = displayTrip ? displayTrip.stops_sequence : [];

    // Calculate Arrival Times based on the first departure time
    const scheduleItems = useMemo(() => {
        if (!displayTrip || !displayTrip.times || displayTrip.times.length === 0) return [];

        const startTimeStr = displayTrip.times[0]; // e.g., "07:30"
        const [startH, startM] = startTimeStr.split(':').map(Number);
        let currentSeconds = startH * 3600 + startM * 60;

        // Resolve stop objects
        const resolvedStops = stopIds.map(id => stops.find(s => s.id === id)).filter(Boolean);

        return resolvedStops.map((stop, index) => {
            // New Backend Logic: Use pre-calculated offsets from 'enrichSchedule'
            if (displayTrip.arrival_offsets && displayTrip.arrival_offsets[index] !== undefined) {
                const offsetMins = displayTrip.arrival_offsets[index];
                const totalMins = startH * 60 + startM + offsetMins;
                const h = Math.floor(totalMins / 60) % 24;
                const m = totalMins % 60;
                const timeStr = `${h}:${m.toString().padStart(2, '0')}`;

                return {
                    ...stop,
                    calculatedTime: timeStr
                };
            }

            // Fallback: Client-side estimation
            let arrivalTimeStr = "";

            if (index === 0) {
                arrivalTimeStr = startTimeStr;
            } else {
                const prev = resolvedStops[index - 1];
                const dist = getDistance(prev.lat, prev.lon, stop.lat, stop.lon);
                const travelTime = dist / BUS_SPEED_MPS; // seconds

                currentSeconds += travelTime + STOP_DWELL_TIME_SEC;

                const h = Math.floor(currentSeconds / 3600) % 24;
                const m = Math.floor((currentSeconds % 3600) / 60);
                const mm = m.toString().padStart(2, '0');
                arrivalTimeStr = `${h}:${mm}`;
            }

            return {
                ...stop,
                calculatedTime: arrivalTimeStr
            };
        });
    }, [displayTrip, stopIds, stops]);

    // Early return after all hooks have been called
    if (!service) return (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No schedule available
        </div>
    );

    return (
        <div className="schedule-view">
            <div className="schedule-header">
                <div>
                    <h3 className="schedule-title">{displayTrip?.headsign || "Route Schedule"}</h3>
                </div>
            </div>

            <div className="timeline-container">
                <div className="timeline-track"></div>

                {scheduleItems.map((item, index) => (
                    <div key={index} className={`timeline-item ${index === 0 ? 'active' : ''}`}>
                        <div className="timeline-dot"></div>
                        <div className="timeline-content">
                            <div>
                                <p className="stop-name">{item.name || item.id}</p>
                            </div>
                            <span className="stop-time">
                                {item.calculatedTime}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Departure Chips */}
            <div style={{ marginTop: '1.5rem' }}>
                <p className="section-title">All Departures</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {displayTrip?.times?.map((time, idx) => (
                        <span key={idx} style={{
                            fontSize: '0.75rem',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background: 'var(--surface-dark)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-muted)'
                        }}>
                            {time}
                        </span>
                    ))}
                </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '8px' }}>
                <button className="mode-btn active" style={{ flex: 1, justifyContent: 'center' }}>
                    View Full Timetable
                </button>
                <button className="mode-btn" style={{ width: '40px', justifyContent: 'center' }}>
                    <span className="material-icons-round">print</span>
                </button>
            </div>
        </div>
    );
};

export default ScheduleView;
