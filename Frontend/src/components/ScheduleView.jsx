import React from 'react';

const ScheduleView = ({ service }) => {
    if (!service) return <div className="schedule-placeholder">No schedule available</div>;

    return (
        <div className="schedule-view">
            <h3>Schedule ({service.service_id})</h3>

            <div className="trips-container">
                {service.trips.map((trip, tIndex) => (
                    <div key={tIndex} className="trip-card">
                        <h4>{trip.headsign}</h4>
                        <div className="stops-times-grid">
                            {/* Header Row */}
                            <div className="grid-header">
                                {trip.stops_sequence.map((stopId, sIndex) => (
                                    <div key={sIndex} className="stop-header">{stopId}</div>
                                ))}
                            </div>
                            {/* Times Row (Wait, the data structure is: trips have stops_sequence and then ONE list of times? 
                               Checking schedule.json... 
                               "trips": [{ "headsign": "...", "stops_sequence": [...], "times": ["07:30", "08:00"] }]
                               Ah, "times" seems to be the START times of the trip? Or is it meaningful?
                               Looking at schedule.json again.
                               "stops_sequence": ["KP1", "KTC_A", ...], "times": ["07:30", "08:00", ...]
                               Wait, the 'times' array length is often much longer than stops_sequence.
                               It matches the number of DEPARTURES from the first stop?
                               Let's assume "times" are the departure times from the FIRST stop. 
                               But the trip might just list the PATTERN of stops.
                               This viewer needs to show WHEN the bus is at each stop.
                               However, the JSON structure "compact frequency" implies we calculate it.
                               For now, let's just list the provided times as "Departures from First Stop".
                             */}
                            <div className="times-list">
                                <p><strong>Departures:</strong></p>
                                <div className="time-chips">
                                    {trip.times.map((time, timeIdx) => (
                                        <span key={timeIdx} className="time-chip">{time}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ScheduleView;
