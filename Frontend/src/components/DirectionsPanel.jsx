import React from 'react';

const DirectionsPanel = ({ directions, onClose, loading, onPlanFutureTrip }) => {
    if (loading) {
        return (
            <div className="directions-panel">
                <div className="directions-header">
                    <h3>🚌 Getting Directions...</h3>
                </div>
                <div className="directions-loading">
                    <div className="loading-spinner"></div>
                    <p>Finding the best route for you...</p>
                </div>
            </div>
        );
    }

    if (!directions) return null;

    // Handle errors
    if (directions.error) {
        return (
            <div className="directions-panel">
                <div className="directions-header">
                    <h3>⚠️ No Route Found</h3>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>
                <div className="directions-error">
                    <p>{directions.error}</p>
                    {directions.suggestion && <p className="suggestion">{directions.suggestion}</p>}
                    {directions.debug && (
                        <div className="debug-info">
                            <p><strong>From:</strong> {directions.debug.originStop}</p>
                            <p>Served by: {directions.debug.originServedBy?.join(', ')}</p>
                            <p><strong>To:</strong> {directions.debug.destStop}</p>
                            <p>Served by: {directions.debug.destServedBy?.join(', ')}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Walk only scenario
    if (directions.type === 'WALK_ONLY') {
        return (
            <div className="directions-panel">
                <div className="directions-header">
                    <h3>📍 {directions.destination.name}</h3>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>
                <div className="directions-message">
                    <span className="walk-icon">🚶</span>
                    <p>{directions.message}</p>
                    <p className="distance-info">
                        {directions.totalWalkingDistance}m walk (~{directions.totalDuration} min)
                    </p>

                    {/* Future Bus Option (No bus now) */}
                    {directions.nextAvailableBus && (
                        <div className="future-bus-option">
                            <div className="future-bus-info">
                                <span className="bus-icon">🚌</span>
                                <div>
                                    <strong>Want to take the bus?</strong>
                                    <p>Next: {directions.nextAvailableBus.routeName} at {directions.nextAvailableBus.nextDeparture} ({directions.nextAvailableBus.day})</p>
                                </div>
                            </div>
                            <button
                                className="plan-trip-btn"
                                onClick={() => onPlanFutureTrip(directions.nextAvailableBus.day, directions.nextAvailableBus.nextDeparture)}
                            >
                                View Route & Schedule
                            </button>
                        </div>
                    )}

                    {/* Alternative Bus Option (Bus exists but walking is faster) */}
                    {directions.alternativeBus && (
                        <div className="future-bus-option">
                            <div className="future-bus-info">
                                <span className="bus-icon">🚌</span>
                                <div>
                                    <strong>Prefer the bus?</strong>
                                    <p>{directions.alternativeBus.routeName} (Dept: {directions.alternativeBus.nextDeparture})</p>
                                    <p style={{ fontSize: '0.8em', color: '#ccc' }}>Trip time: ~{directions.alternativeBus.totalDuration} min</p>
                                </div>
                            </div>
                            <button
                                className="plan-trip-btn"
                                onClick={() => onPlanFutureTrip(directions.alternativeBus.day || 'today', directions.alternativeBus.nextDeparture, true)}
                            >
                                Show Bus Route
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Bus route directions
    return (
        <div className="directions-panel">
            <div className="directions-header">
                <h3>📍 {directions.destination.name}</h3>
                <button className="close-btn" onClick={onClose}>✕</button>
            </div>

            {/* Summary */}
            <div className="directions-summary">
                <div className="route-badge">{directions.summary.route}</div>
                <div className="summary-details">
                    <span className="departure-time">
                        🕐 Departs {directions.summary.departureDay ? `${directions.summary.departureDay} ` : ''}at {directions.summary.departure}
                    </span>
                    <span className="walk-total">🚶 {directions.totalWalkingDistance}m total walking</span>
                </div>
            </div>

            {/* Steps */}
            <div className="directions-steps">
                {directions.steps.map((step, index) => (
                    <div key={index} className={`step step-${step.type}`}>
                        <div className="step-icon">
                            {step.type === 'walk' && '🚶'}
                            {step.type === 'board' && '🚌'}
                            {step.type === 'ride' && '➡️'}
                            {step.type === 'alight' && '📍'}
                        </div>
                        <div className="step-content">
                            <p className="step-instruction">{step.instruction}</p>
                            {step.type === 'walk' && (
                                <span className="step-meta">{step.distance}m • ~{step.duration} min</span>
                            )}
                            {step.type === 'board' && (
                                <div className="step-meta">
                                    <span className="stop-name">at {step.stopName}</span>
                                    {step.upcomingTimes && step.upcomingTimes.length > 1 && (
                                        <span className="more-times">
                                            Also at: {step.upcomingTimes.slice(1).join(', ')}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Alternatives */}
            {directions.alternatives && directions.alternatives.length > 0 && (
                <div className="alternatives">
                    <h4>Alternative Routes</h4>
                    {directions.alternatives.map((alt, idx) => (
                        <div key={idx} className="alt-route">
                            <span className="alt-badge">{alt.routeName}</span>
                            <span className="alt-time">at {alt.nextDeparture}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Direct walk option */}
            {directions.directWalkDistance && directions.directWalkDistance < 1500 && (
                <div className="walk-option">
                    <span>🚶 Or walk directly: {directions.directWalkDistance}m (~{Math.ceil(directions.directWalkDistance / 80)} min)</span>
                </div>
            )}
        </div>
    );
};

export default DirectionsPanel;
