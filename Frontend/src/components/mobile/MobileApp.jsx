import { useState, useEffect, useRef } from 'react';
import MobileWelcomePage from './MobileWelcomePage';
import MobileHomePage from './MobileHomePage';
import MobileRoutesPage from './MobileRoutesPage';
import MobileRouteDetailPage from './MobileRouteDetailPage';
import MobileNavigatePage from './MobileNavigatePage';
import MobileSearchPage from './MobileSearchPage';
import MobileInfoPage from './MobileInfoPage';
import MobileContributePage from './MobileProfilePage';

const MobileApp = ({
    data,
    userLocation,
    selectedOrigin,
    selectedDestination,
    onGetDirections,
    onSelectOrigin,
    onSelectRoute,
    onDirectionSelect,
    mode,
    visibleStops,
    selectedStopIds,
    routeGeometry,
    walkingGeometries,
    busRouteGeometry,
    busRouteSegments,
    directionsMarkers,
    selectedServiceIndex,
    directions,
    directionsLoading,
    onCloseDirections,
    onPlanFutureTrip,
    onRestoreJourney
}) => {
    const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
    const [mobileView, setMobileView] = useState('home'); // 'home', 'routes', 'route-detail', 'navigate', 'search', 'profile', 'info'
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [searchType, setSearchType] = useState('destination'); // 'origin' | 'destination'

    // Pin mode state
    const [pinMode, setPinMode] = useState(null); // 'origin' | 'destination' | null
    const [pinnedLocation, setPinnedLocation] = useState(null); // { lat, lon, type }

    // Saved journey state for restoring when returning to navigate tab
    const savedJourneyRef = useRef(null);
    const previousTabRef = useRef('home');

    // Handle map click when in pin mode
    const handleMapClick = (lat, lon, type) => {
        setPinnedLocation({ lat, lon, type });
    };

    // Start pin mode from search page
    const handlePinOnMap = (type) => {
        setPinMode(type);
        setPinnedLocation(null);
        setMobileView('navigate');
    };

    // Confirm pinned location
    const handleConfirmPin = () => {
        if (!pinnedLocation) return;

        // Create a custom location object for the pinned location
        const customLocation = {
            id: `PINNED_${pinnedLocation.lat.toFixed(6)}_${pinnedLocation.lon.toFixed(6)}`,
            name: `Pinned Location (${pinnedLocation.lat.toFixed(4)}, ${pinnedLocation.lon.toFixed(4)})`,
            lat: pinnedLocation.lat,
            lon: pinnedLocation.lon,
            category: 'pinned'
        };

        if (pinnedLocation.type === 'origin') {
            if (onSelectOrigin) {
                onSelectOrigin(customLocation);
            }
        } else {
            if (onGetDirections) {
                onGetDirections(customLocation);
            }
        }

        // Clear pin mode
        setPinMode(null);
        setPinnedLocation(null);
    };

    // Cancel pin mode
    const handleCancelPin = () => {
        setPinMode(null);
        setPinnedLocation(null);
    };

    const handleSelectLocation = (location) => {
        if (searchType === 'origin') {
            if (onSelectOrigin) {
                onSelectOrigin(location);
            }
            setMobileView('navigate');
        } else {
            // Destination
            if (onGetDirections) {
                onGetDirections(location);
                setMobileView('navigate');
            }
        }
    };

    // Check localStorage for welcome screen
    useEffect(() => {
        const seen = localStorage.getItem('utmove_seen_welcome');
        if (seen) {
            setHasSeenWelcome(true);
        }
    }, []);

    const handleGetStarted = () => {
        localStorage.setItem('utmove_seen_welcome', 'true');
        setHasSeenWelcome(true);
    };

    const handleSkip = () => {
        localStorage.setItem('utmove_seen_welcome', 'true');
        setHasSeenWelcome(true);
    };

    const handleTabChange = (tab) => {
        const currentTab = mobileView;

        // Save journey data when leaving navigate tab (but not when going to search)
        if (currentTab === 'navigate' && tab !== 'navigate' && tab !== 'search') {
            // Save current journey if there's any destination or origin set
            if (selectedDestination || selectedOrigin || directions) {
                savedJourneyRef.current = {
                    origin: selectedOrigin,
                    destination: selectedDestination,
                    directions: directions,
                    walkingGeometries: walkingGeometries,
                    busRouteGeometry: busRouteGeometry,
                    busRouteSegments: busRouteSegments,
                    directionsMarkers: directionsMarkers
                };
            }
            // Clear directions when leaving navigate tab
            if (onCloseDirections) {
                onCloseDirections();
            }
        }

        // Restore journey when returning to navigate tab
        if (tab === 'navigate' && currentTab !== 'navigate' && currentTab !== 'search') {
            if (savedJourneyRef.current && onRestoreJourney) {
                onRestoreJourney(savedJourneyRef.current);
            }
        }

        setMobileView(tab);
        setSelectedRoute(null);
        // Clear route geometry when changing tabs
        if (onSelectRoute) {
            onSelectRoute(null, undefined, true);
        }
        previousTabRef.current = currentTab;
    };

    const handleSelectRoute = (route, serviceId) => {
        setSelectedRoute(route);
        if (onSelectRoute) {
            onSelectRoute(route.name, serviceId);
        }
        setMobileView('route-detail');
    };

    const handlePreviewRoute = (route) => {
        setSelectedRoute(route);
        if (onSelectRoute) {
            // Pass null to clear geometry when "All Routes" is selected
            onSelectRoute(route?.name || null, undefined, true);
        }
    };

    const handleBackFromRouteDetail = () => {
        setSelectedRoute(null);
        if (onSelectRoute) {
            onSelectRoute(null, undefined, true);
        }
        setMobileView('routes');
    };

    const handleOpenSearch = (type = 'destination') => {
        setSearchType(type);
        setMobileView('search');
    };

    const handleBackFromSearch = () => {
        setMobileView('navigate');
    };

    // Show welcome screen on first visit
    if (!hasSeenWelcome) {
        return (
            <MobileWelcomePage
                onGetStarted={handleGetStarted}
                onSkip={handleSkip}
            />
        );
    }

    // Render based on current view
    switch (mobileView) {
        case 'home':
            return (
                <MobileHomePage
                    activeTab="home"
                    onTabChange={handleTabChange}
                    stops={data?.stops || []}
                    routes={data?.routes || []}
                    userLocation={userLocation}
                    mode={mode}
                    visibleStops={visibleStops}
                    selectedStopIds={selectedStopIds}
                    routeGeometry={routeGeometry}
                    route_geometries={data?.route_geometries || {}}
                    walkingGeometries={walkingGeometries}
                    busRouteGeometry={busRouteGeometry}
                    busRouteSegments={busRouteSegments}
                    directionsMarkers={directionsMarkers}
                    onSelectRoute={handlePreviewRoute}
                    selectedRoute={selectedRoute}
                    onGetDirections={onGetDirections}
                />
            );

        case 'routes':
            return (
                <MobileRoutesPage
                    activeTab="routes"
                    onTabChange={handleTabChange}
                    routes={data?.routes || []}
                    onSelectRoute={handleSelectRoute}
                />
            );

        case 'route-detail':
            return (
                <MobileRouteDetailPage
                    activeTab="routes"
                    onTabChange={handleTabChange}
                    route={selectedRoute}
                    stops={data?.stops || []}
                    onBack={handleBackFromRouteDetail}
                    userLocation={userLocation}
                    routeGeometry={routeGeometry}
                    selectedStopIds={selectedStopIds}
                    onDirectionSelect={onDirectionSelect}
                    selectedServiceIndex={selectedServiceIndex}
                />
            );

        case 'navigate':
            return (
                <MobileNavigatePage
                    key={directions?.destination?.id || directions?.destination?.name || 'navigate'}
                    activeTab="navigate"
                    onTabChange={handleTabChange}
                    onOpenSearch={handleOpenSearch}
                    userLocation={userLocation}
                    selectedOrigin={selectedOrigin}
                    selectedDestination={selectedDestination}
                    mode={mode}
                    visibleStops={visibleStops}
                    selectedStopIds={selectedStopIds}
                    routeGeometry={routeGeometry}
                    walkingGeometries={walkingGeometries}
                    busRouteGeometry={busRouteGeometry}
                    busRouteSegments={busRouteSegments}
                    directionsMarkers={directionsMarkers}
                    directions={directions}
                    loading={directionsLoading}
                    onClose={onCloseDirections}
                    onPlanFutureTrip={onPlanFutureTrip}
                    pinMode={pinMode}
                    pinnedLocation={pinnedLocation}
                    onMapClick={handleMapClick}
                    onConfirmPin={handleConfirmPin}
                    onCancelPin={handleCancelPin}
                />
            );

        case 'search':
            return (
                <MobileSearchPage
                    activeTab="navigate"
                    onTabChange={handleTabChange}
                    onBack={handleBackFromSearch}
                    locations={data?.locations || []}
                    stops={data?.stops || []}
                    onSelectLocation={handleSelectLocation}
                    searchType={searchType}
                    onPinOnMap={handlePinOnMap}
                />
            );

        case 'info':
            return (
                <MobileInfoPage
                    activeTab="routes"
                    onTabChange={handleTabChange}
                />
            );

        case 'profile':
            return (
                <MobileContributePage
                    activeTab="profile"
                    onTabChange={handleTabChange}
                />
            );

        default:
            return (
                <MobileHomePage
                    activeTab="home"
                    onTabChange={handleTabChange}
                    stops={data?.stops || []}
                    routes={data?.routes || []}
                    userLocation={userLocation}
                    mode={mode}
                    visibleStops={visibleStops}
                    selectedStopIds={selectedStopIds}
                    routeGeometry={routeGeometry}
                    walkingGeometries={walkingGeometries}
                    busRouteGeometry={busRouteGeometry}
                    busRouteSegments={busRouteSegments}
                    directionsMarkers={directionsMarkers}
                />
            );
    }
};

export default MobileApp;
