import { useState, useEffect, useRef } from 'react';

import MobileHomePage from './MobileHomePage';
import MobileRoutesPage from './MobileRoutesPage';
import MobileRouteDetailPage from './MobileRouteDetailPage';
import MobileInfoPage from './MobileInfoPage';
import MobileContributePage from './MobileProfilePage';

const MobileApp = ({
    data,
    userLocation,
    onSelectRoute,
    onDirectionSelect,
    visibleStops,
    selectedStopIds,
    routeGeometry,
    selectedServiceIndex,
}) => {

    const [mobileView, setMobileView] = useState('home'); // 'home', 'routes', 'route-detail', 'profile', 'info'
    const [selectedRoute, setSelectedRoute] = useState(null);

    // Show all stops on map toggle
    const [showAllStops, setShowAllStops] = useState(false);

    // Track if navigation is from popstate (back button) to prevent pushing duplicate history
    const isPopstateNavigation = useRef(false);

    // Initialize history state on mount
    useEffect(() => {
        // Replace current state with initial view
        window.history.replaceState({ view: 'home', route: null }, '', window.location.href);

        // Handle browser back/forward button
        const handlePopState = (event) => {
            if (event.state) {
                isPopstateNavigation.current = true;
                const { view, route } = event.state;

                if (view === 'route-detail' && route) {
                    setSelectedRoute(route);
                    setMobileView('route-detail');
                    if (onSelectRoute) {
                        onSelectRoute(route.name, undefined);
                    }
                } else {
                    setSelectedRoute(null);
                    setMobileView(view || 'home');
                    // Clear route geometry when going back to routes or other views
                    if (onSelectRoute) {
                        onSelectRoute(null, undefined, true);
                    }
                }

                // Reset flag after a short delay
                setTimeout(() => {
                    isPopstateNavigation.current = false;
                }, 100);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [onSelectRoute]);

    const handleTabChange = (tab) => {
        setMobileView(tab);
        setSelectedRoute(null);
        // Clear route geometry when changing tabs
        if (onSelectRoute) {
            onSelectRoute(null, undefined, true);
        }

        // Push to browser history (skip if this was triggered by back button)
        if (!isPopstateNavigation.current) {
            window.history.pushState({ view: tab, route: null }, '', window.location.href);
        }
    };

    const handleSelectRoute = (route, serviceId) => {
        setSelectedRoute(route);
        if (onSelectRoute) {
            onSelectRoute(route.name, serviceId);
        }
        setMobileView('route-detail');

        // Push to browser history with route data
        if (!isPopstateNavigation.current) {
            window.history.pushState({ view: 'route-detail', route: route }, '', window.location.href);
        }
    };

    const handlePreviewRoute = (route) => {
        setSelectedRoute(route);
        if (onSelectRoute) {
            onSelectRoute(route?.name || null, undefined, true);
        }
    };

    const handleBackFromRouteDetail = () => {
        setMobileView('routes');
        setSelectedRoute(null);
        if (onSelectRoute) {
            onSelectRoute(null, undefined, true);
        }
    };

    switch (mobileView) {
        case 'home':
        // eslint-disable-next-line no-fallthrough
        default:
            return (
                <MobileHomePage
                    activeTab="home"
                    onTabChange={handleTabChange}
                    stops={data?.stops || []}
                    routes={data?.routes || []}
                    userLocation={userLocation}
                    mode="explore"
                    visibleStops={showAllStops ? (data?.stops || []) : visibleStops}
                    selectedStopIds={selectedStopIds}
                    routeGeometry={routeGeometry}
                    route_geometries={data?.route_geometries || {}}
                    walkingGeometries={[]}
                    busRouteGeometry={null}
                    busRouteSegments={[]}
                    directionsMarkers={null}
                    onSelectRoute={handlePreviewRoute}
                    selectedRoute={selectedRoute}
                    showAllStops={showAllStops}
                    onToggleShowAllStops={() => setShowAllStops(!showAllStops)}
                    onNavigateToRoute={handleSelectRoute}
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
                    routes={data?.routes || []}
                    stops={data?.stops || []}
                    onBack={handleBackFromRouteDetail}
                    userLocation={userLocation}
                    routeGeometry={routeGeometry}
                    selectedStopIds={selectedStopIds}
                    onDirectionSelect={onDirectionSelect}
                    selectedServiceIndex={selectedServiceIndex}
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
    }
};

export default MobileApp;
