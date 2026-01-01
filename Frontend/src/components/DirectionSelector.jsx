import React from 'react';

const DirectionSelector = ({ headsigns, selectedHeadsign, onSelectHeadsign }) => {
    if (!headsigns || headsigns.length <= 1) return null;

    return (
        <div className="direction-selector">
            <h4>Select Direction</h4>
            <div className="direction-buttons">
                {headsigns.map(headsign => (
                    <button
                        key={headsign}
                        className={`dir-btn ${selectedHeadsign === headsign ? 'active' : ''}`}
                        onClick={() => onSelectHeadsign(headsign)}
                    >
                        {headsign}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default DirectionSelector;
