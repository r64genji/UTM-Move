import { useState, useEffect } from 'react';
import MobileWelcomePage from './MobileWelcomePage';
import MobileHomePage from './MobileHomePage';
import MobileRoutesPage from './MobileRoutesPage';
import MobileRouteDetailPage from './MobileRouteDetailPage';
import MobileNavigatePage from './MobileNavigatePage';
import MobileSearchPage from './MobileSearchPage';
import MobileContributePage from './MobileProfilePage';

const MobileApp = ({
    data,
    userLocation,
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
    onPlanFutureTrip
}) => {
    const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
    const [mobileView, setMobileView] = useState('home'); // 'home', 'routes', 'route-detail', 'navigate', 'search', 'profile'
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [searchType, setSearchType] = useState('destination'); // 'origin' | 'destination'

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
        setMobileView(tab);
        setSelectedRoute(null);
        // Clear route geometry when changing tabs
        if (onSelectRoute) {
            onSelectRoute(null, undefined, true);
        }
        // Clear directions when leaving navigate tab
        if (tab !== 'navigate' && onCloseDirections) {
            onCloseDirections();
        }
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
