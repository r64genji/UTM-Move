import React, { useState } from 'react';

const DirectionsPanel = ({ directions, onClose, loading, onPlanFutureTrip }) => {
    const [expandedSteps, setExpandedSteps] = useState({});

    const toggleStep = (index) => {
        setExpandedSteps(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

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
                        🕐 Departs: {directions.summary.departureDay ? `${directions.summary.departureDay} ` : ''}{directions.summary.departure}
                    </span>
                    {directions.summary.busArrivalTime && (
                        <span className="arrival-time">
                            🏁 Bus Arrives: {directions.summary.busArrivalTime}
                        </span>
                    )}
                    {directions.summary.eta && (
                        <span className="eta-time">
                            📍 ETA: {directions.summary.eta}
                        </span>
                    )}
                    {directions.summary.totalDuration > 0 && (
                        <span className="total-duration">
                            ⏱️ Total: ~{Math.round(directions.summary.totalDuration)} min
                        </span>
                    )}
                </div>
                <div className="walking-details">
                    <span className="walk-total">🚶 {directions.totalWalkingDistance}m total walking</span>
                </div>
            </div>

            {/* Steps */}
            <div className="directions-steps">
                {directions.steps.map((step, index) => (
                    <div key={index} className={`step step-${step.type} ${expandedSteps[index] ? 'expanded' : ''}`}>
                        <div
                            className="step-icon"
                            onClick={() => step.details && toggleStep(index)}
                            style={{
                                cursor: step.details ? 'pointer' : 'default',
                                borderColor: step.type === 'walk' ? '#22c55e' : 'var(--border-color)'
                            }}
                        >
                            {step.type === 'walk' && <span style={{ color: '#22c55e' }}>🚶</span>}
                            {step.type === 'board' && '🚌'}
                            {step.type === 'transfer' && '🔄'}
                            {step.type === 'ride' && '➡️'}
                            {step.type === 'alight' && '📍'}

                            {/* Expand arrow indicator */}
                            {step.type === 'walk' && step.details && step.details.length > 0 && (
                                <div className={`expand-indicator ${expandedSteps[index] ? 'expanded' : ''}`}>
                                    ▼
                                </div>
                            )}
                        </div>
                        <div className="step-content">
                            <div className="step-header">
                                <p className="step-instruction">{step.instruction}</p>
                                {step.time && <span className="step-time">{step.time}</span>}
                            </div>

                            {step.type === 'walk' && (
                                <>
                                    <span className="step-meta">{step.distance}m • ~{step.duration} min</span>
                                    {/* Detailed walking instructions */}
                                    {expandedSteps[index] && step.details && (
                                        <div className="step-details">
                                            {step.details.map((detail, i) => (
                                                <div key={i} className="walk-detail-item">
                                                    <span className="detail-icon">{detail.icon}</span>
                                                    <span className="detail-text">{detail.instruction}</span>
                                                    <span className="detail-dist">{detail.distance}m</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {(step.type === 'board' || step.type === 'transfer') && (
                                <div className="step-meta">
                                    <span className="stop-name">at {step.stopName}</span>
                                    {step.upcomingTimes && step.upcomingTimes.length > 1 && (
                                        <span className="more-times">
                                            Also at: {step.upcomingTimes.slice(1).join(', ')}
                                        </span>
                                    )}
                                </div>
                            )}
                            {step.type === 'alight' && (
                                <div className="step-meta">
                                    <span className="stop-name">at {step.stopName}</span>
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
