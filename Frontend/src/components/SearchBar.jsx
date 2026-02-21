import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

const SearchBar = ({
    locations,
    stops,
    onSelectDestination,
    onSelectOrigin,
    onUseCurrentLocation,
    disabled
}) => {
    const [useGPS, setUseGPS] = useState(true);
    const [selectedDestination, setSelectedDestination] = useState(null);
    const [originQuery, setOriginQuery] = useState('');
    const [destQuery, setDestQuery] = useState('');

    const originRef = useRef(null);
    const destRef = useRef(null);

    // Combined search pool: locations + stops — memoized so it only rebuilds
    // when the underlying data changes, not on every render.
    const searchPool = useMemo(() => [
        ...locations.map(loc => ({ ...loc, type: 'location' })),
        ...stops.map(stop => ({
            id: stop.id,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon,
            type: 'stop',
            nearestStop: stop.id
        }))
    ], [locations, stops]);

    // Search function — memoized so derived deps are stable.
    const search = useCallback((query) => {
        if (!query || query.length < 2) return [];
        const q = query.toLowerCase();
        return searchPool.filter(item =>
            item.name.toLowerCase().includes(q) ||
            item.id.toLowerCase().includes(q)
        ).slice(0, 8);
    }, [searchPool]);

    // Derive search results directly — avoids the setState-in-effect anti-pattern.
    const originResults = useMemo(() =>
        (!useGPS && originQuery.length >= 2) ? search(originQuery) : []
        , [useGPS, originQuery, search]);

    const destResults = useMemo(() =>
        destQuery.length >= 2 ? search(destQuery) : []
        , [destQuery, search]);

    // Show/hide dropdowns derived from results
    const [showOriginDropdown, setShowOriginDropdown] = useState(false);
    const [showDestDropdown, setShowDestDropdown] = useState(false);

    // Sync dropdown visibility when results change
    useEffect(() => {
        setShowOriginDropdown(originResults.length > 0);
    }, [originResults]);

    useEffect(() => {
        setShowDestDropdown(destResults.length > 0);
    }, [destResults]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (originRef.current && !originRef.current.contains(e.target)) {
                setShowOriginDropdown(false);
            }
            if (destRef.current && !destRef.current.contains(e.target)) {
                setShowDestDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleOriginSelect = (item) => {
        setOriginQuery(item.name);
        setShowOriginDropdown(false);
        onSelectOrigin(item);
    };

    const handleDestSelect = (item) => {
        setSelectedDestination(item);
        setDestQuery(item.name);
        setShowDestDropdown(false);
        onSelectDestination(item);
    };

    const handleGPSToggle = () => {
        setUseGPS(!useGPS);
        if (!useGPS) {
            // Switching to GPS mode
            setOriginQuery('');
            onUseCurrentLocation();
        }
    };

    const handleGetDirections = () => {
        if (selectedDestination) {
            onSelectDestination(selectedDestination);
        }
    };

    return (
        <div className="search-container">
            <h3 className="search-title">🔍 Find Location</h3>

            {/* Origin Input */}
            <div className="search-section">
                <label className="search-label">From:</label>
                <div className="origin-toggle">
                    <button
                        className={`toggle-btn ${useGPS ? 'active' : ''}`}
                        onClick={handleGPSToggle}
                    >
                        📍 Current Location
                    </button>
                    <button
                        className={`toggle-btn ${!useGPS ? 'active' : ''}`}
                        onClick={handleGPSToggle}
                    >
                        🔍 Search
                    </button>
                </div>

                {!useGPS && (
                    <div className="search-input-wrapper" ref={originRef}>
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search starting point..."
                            value={originQuery}
                            onChange={(e) => setOriginQuery(e.target.value)}
                            disabled={disabled}
                        />
                        {showOriginDropdown && originResults.length > 0 && (
                            <ul className="search-dropdown">
                                {originResults.map(item => (
                                    <li
                                        key={`origin-${item.id}`}
                                        className="search-item"
                                        onClick={() => handleOriginSelect(item)}
                                    >
                                        <span className="item-icon">
                                            {item.type === 'stop' ? '🚏' : '📍'}
                                        </span>
                                        <span className="item-name">{item.name}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {/* Destination Input */}
            <div className="search-section">
                <label className="search-label">To:</label>
                <div className="search-input-wrapper" ref={destRef}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Where do you want to go?"
                        value={destQuery}
                        onChange={(e) => setDestQuery(e.target.value)}
                        disabled={disabled}
                    />
                    {showDestDropdown && destResults.length > 0 && (
                        <ul className="search-dropdown">
                            {destResults.map(item => (
                                <li
                                    key={`dest-${item.id}`}
                                    className="search-item"
                                    onClick={() => handleDestSelect(item)}
                                >
                                    <span className="item-icon">
                                        {item.type === 'stop' ? '🚏' :
                                            item.category === 'faculty' ? '🏛️' :
                                                item.category === 'residential' ? '🏠' : '📍'}
                                    </span>
                                    <div className="item-details">
                                        <span className="item-name">{item.name}</span>
                                        {item.category && (
                                            <span className="item-category">{item.category}</span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {selectedDestination && (
                <button
                    className="directions-btn"
                    onClick={handleGetDirections}
                    disabled={disabled}
                >
                    🚌 Get Directions
                </button>
            )}
        </div>
    );
};

export default SearchBar;
