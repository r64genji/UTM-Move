import React from 'react';

const RouteSelector = ({ routes, selectedRoute, onSelectRoute }) => {
    return (
        <div className="route-selector">
            <h3>Select a Route</h3>
            <div className="button-group">
                {routes.map(route => (
                    <button
                        key={route.name}
                        className={`route-btn ${selectedRoute === route.name ? 'active' : ''}`}
                        onClick={() => onSelectRoute(route.name)}
                    >
                        {route.name}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default RouteSelector;
