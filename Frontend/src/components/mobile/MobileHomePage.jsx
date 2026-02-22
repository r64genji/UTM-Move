import { useState, useEffect, useMemo } from 'react';
import BottomNavigation from './BottomNavigation';
import MapComponent from '../Map';
import { getRouteColor } from '../../constants';


const MobileHomePage = ({
    activeTab,
    onTabChange,
    stops,
    routes,
    userLocation,
    mode,
    visibleStops,
    selectedStopIds,
    routeGeometry,
    route_geometries,
    walkingGeometries,
    busRouteGeometry,
    busRouteSegments,
    directionsMarkers,
    onSelectRoute,
    selectedRoute,
    showAllStops,
    onToggleShowAllStops,
    onNavigateToRoute
}) => {
    // Compute all route geometries when no specific route is selected
    const allRouteGeometries = useMemo(() => {
        if (selectedRoute || !route_geometries) return [];

        // Get ALL geometries for each route (all headsigns to show full loops)
        const routeGeoms = [];

        Object.keys(route_geometries).forEach(key => {
            const match = key.match(/^(Route [A-Z])/i);
            if (match) {
                routeGeoms.push({
                    name: key,
                    geometry: route_geometries[key],
                    color: getRouteColor(match[1])
                });
            }
        });

        return routeGeoms;
    }, [selectedRoute, route_geometries]);
    // Haversine Distance Helper
    const getDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Get nearest stop
    const nearestStop = useMemo(() => {
        if (!userLocation || !stops || stops.length === 0) {
            return stops && stops.length > 0 ? stops[0] : null;
        }

        let minDistance = Infinity;
        let closest = stops[0];

        stops.forEach(stop => {
            const distance = getDistance(userLocation.lat, userLocation.lng || userLocation.lon, stop.lat, stop.lon || stop.lng);
            if (distance < minDistance) {
                minDistance = distance;
                closest = stop;
            }
        });

        return { ...closest, distance: minDistance };
    }, [userLocation, stops]);

    // Get routes serving this stop
    const routesAtStop = useMemo(() => {
        if (!nearestStop || !routes) return [];
        return routes.filter(route =>
            route.services.some(service =>
                service.trips.some(trip =>
                    trip.stops_sequence.includes(nearestStop.id)
                )
            )
        );
    }, [nearestStop, routes]);

    // Get time-based greeting
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    // PWA Install State
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showInstallBanner, setShowInstallBanner] = useState(true);

    useEffect(() => {
        // Check if user previously dismissed the banner
        const isHidden = localStorage.getItem('hideInstallBanner') === 'true';
        setShowInstallBanner(!isHidden);

        const handleBeforeInstallPrompt = (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);

        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null);
    };

    // Get bus estimates locally
    const [nearestArrivals, setNearestArrivals] = useState([]);

    useEffect(() => {
        if (!nearestStop || !routesAtStop || routesAtStop.length === 0) {
            setNearestArrivals([]);
            return;
        }

        const updateArrivals = async () => {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

            // Dynamic import to avoid circular dependencies if any
            const { calculateNextBus } = await import('../../utils/scheduleUtils');

            const allUpcoming = [];

            routesAtStop.forEach(route => {
                const result = calculateNextBus(route, timeStr, nearestStop.id);
                if (result && result.upcoming) {
                    allUpcoming.push(...result.upcoming);
                }
            });

            // Sort by remaining time
            allUpcoming.sort((a, b) => a.remaining - b.remaining);
            setNearestArrivals(allUpcoming);
        };

        updateArrivals();

        // Update frequently for "Real-time" feel without server cost
        const interval = setInterval(updateArrivals, 30000); // 30s refresh
        return () => clearInterval(interval);
    }, [nearestStop, routesAtStop]);

    return (
        <div className="relative flex h-screen w-full flex-col group/design-root overflow-hidden max-w-md mx-auto border-x border-gray-200 dark:border-gray-800 bg-[#101922]">
            {/* Header - Stays on top */}
            <div className="px-4 pt-6 pb-4 flex flex-col gap-4 bg-[#1e2a35] z-20 shadow-md shrink-0">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-white tracking-tight text-[22px] font-bold leading-tight">
                            {getGreeting()}, Student
                        </h2>
                        <p className="text-gray-400 text-sm font-normal">
                            Where do you want to go today?
                        </p>
                    </div>

                    {/* Compact Install Button (Icon Only) */}
                    {deferredPrompt && (
                        <button
                            onClick={handleInstallClick}
                            className="flex items-center justify-center p-2 rounded-xl bg-[#2a3b4d] text-white border border-gray-700 shadow-sm active:scale-95 transition-all"
                            aria-label="Install App"
                        >
                            <span className="material-symbols-outlined text-[20px]">install_mobile</span>
                        </button>
                    )}
                </div>

                {/* Proactive Install Banner */}
                {deferredPrompt && showInstallBanner && (
                    <div className="flex items-center justify-between bg-blue-600/10 border border-blue-500/30 rounded-xl p-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                                <span className="material-symbols-outlined text-[18px]">add_to_home_screen</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-blue-100 text-sm font-semibold">Install App</span>
                                <span className="text-blue-300 text-xs">For a better experience</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowInstallBanner(false); // Hide the banner
                                    localStorage.setItem('hideInstallBanner', 'true'); // Persist dismissal
                                    handleInstallClick(); // Trigger the PWA install prompt
                                }}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
                            >
                                Install
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowInstallBanner(false);
                                    localStorage.setItem('hideInstallBanner', 'true');
                                }}
                                className="p-1.5 text-blue-300 hover:text-white rounded-lg hover:bg-blue-500/20 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Search Bar */}
                <label className="flex flex-col h-11 w-full" onClick={() => onTabChange('search')}>
                    <div className="flex w-full flex-1 items-stretch rounded-xl h-full shadow-sm cursor-pointer active:scale-[0.98] active:opacity-80 bg-[#2a3b4d] border border-gray-700 active:border-primary/50">
                        <div className="text-gray-400 flex border-none items-center justify-center pl-4 rounded-l-xl border-r-0">
                            <span className="material-symbols-outlined text-[20px]">search</span>
                        </div>
                        <input
                            className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-white focus:outline-0 focus:ring-0 border-none bg-transparent focus:border-none h-full placeholder:text-gray-400 px-4 rounded-l-none border-l-0 pl-2 text-base font-normal leading-normal pointer-events-none"
                            placeholder="Find stop or location..."
                            readOnly
                        />
                    </div>
                </label>
            </div>

            {/* Main Content Area - Relative Wrapper for Map and Overlay */}
            <div className="relative flex-1 w-full overflow-hidden">
                {/* Map - Absolute Background */}
                <div className="absolute inset-0 z-0">
                    <MapComponent
                        stops={visibleStops || []}
                        selectedRouteStops={selectedStopIds || []}
                        routeGeometry={mode === 'explore' && selectedRoute ? routeGeometry : null}
                        routeColor={getRouteColor(selectedRoute?.name)}
                        allRouteGeometries={mode === 'explore' && !selectedRoute ? allRouteGeometries : []}
                        walkingGeometries={mode === 'directions' ? walkingGeometries : []}
                        busRouteGeometry={mode === 'directions' ? busRouteGeometry : null}
                        busRouteSegments={mode === 'directions' ? busRouteSegments : []}
                        userLocation={userLocation}
                        directionsMarkers={directionsMarkers}
                        routes={routes}
                        onSelectRoute={onNavigateToRoute || onSelectRoute}
                    />
                </div>

                {/* Overlays - Absolute on top of map, pointer-events-none to let map interactions through where empty */}
                <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">

                    {/* Nearest Stop Card - Compact version */}
                    <div className="px-4 py-2 pointer-events-auto">
                        <div className="w-full bg-[#1e2a35] rounded-xl px-3 py-2.5 shadow-lg border border-gray-700">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-primary text-[20px]">location_on</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-blue-400 text-[9px] font-bold uppercase tracking-wider">Nearest Stop</span>
                                        </div>
                                        <h4 className="text-white text-base font-bold leading-tight truncate">
                                            {nearestStop ? nearestStop.name : 'Centre Point'}
                                        </h4>
                                        <div className="mt-1 flex flex-col gap-0.5">
                                            {nearestArrivals && nearestArrivals.length > 0 ? (
                                                // Filter to show only unique routes (earliest arrival per BASE route name)
                                                // Consolidate "Route E(N24)" and "Route E(JA)" into just "E"
                                                nearestArrivals
                                                    .filter((arrival, index, self) => {
                                                        const getBaseName = (name) => name.replace(/\(.*\)/, '').trim();
                                                        const currentBase = getBaseName(arrival.route);
                                                        // Find first occurrence of this base name
                                                        const firstIndex = self.findIndex(t => getBaseName(t.route) === currentBase);
                                                        return index === firstIndex;
                                                    })
                                                    .slice(0, 3)
                                                    .map((arrival, idx) => {
                                                        const routeName = arrival.route.replace('Route ', '').replace(/\(.*\)/, '').trim();
                                                        const routeColor = getRouteColor(arrival.route);
                                                        return (
                                                            <p key={idx} className="text-emerald-400 font-bold text-xs flex items-center">
                                                                <span
                                                                    className="px-1.5 py-0.5 rounded text-[10px] mr-1.5 leading-none shrink-0 shadow-sm border"
                                                                    style={{
                                                                        backgroundColor: `${routeColor}20`, // 12% opacity
                                                                        borderColor: `${routeColor}40`,     // 25% opacity border
                                                                        color: routeColor
                                                                    }}
                                                                >
                                                                    {routeName}
                                                                </span>
                                                                {arrival.headsign && (
                                                                    <span className="px-1.5 py-0.5 rounded text-[10px] mr-1.5 leading-none shrink-0 shadow-sm border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                                                                        {arrival.headsign}
                                                                    </span>
                                                                )}
                                                                <span>: {arrival.remaining} min</span>
                                                            </p>
                                                        );
                                                    })
                                            ) : (
                                                <p className="text-gray-400 text-[11px] font-medium">
                                                    {nearestStop?.distance ? `${Math.round(nearestStop.distance)}m` : '150m'} • ~{nearestStop?.distance ? Math.round(nearestStop.distance / 80) : '2'} min walk
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Spacer to push content down if needed, or just let map show */}

                    {/* Route Filter Pills - Floating below card */}
                    <div className="px-4 mt-2 overflow-x-auto no-scrollbar pointer-events-auto">
                        <div className="flex gap-3 w-max">
                            {/* Show All Stops Toggle */}
                            <button
                                className={`flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-full pl-3 pr-4 shadow-md active:scale-95 active:opacity-80 ${showAllStops
                                    ? 'bg-emerald-600 text-white shadow-emerald-900/20'
                                    : 'bg-[#2a3b4d] border border-gray-700 text-gray-200'
                                    }`}
                                onClick={() => onToggleShowAllStops && onToggleShowAllStops()}
                            >
                                <span className="material-symbols-outlined text-[16px]">{showAllStops ? 'visibility' : 'visibility_off'}</span>
                                <p className={`text-sm font-medium leading-normal ${showAllStops ? 'text-white' : 'text-gray-200'}`}>Stops</p>
                            </button>

                            <button
                                className={`flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-full pl-4 pr-4 shadow-md active:scale-95 active:opacity-80 ${!selectedRoute
                                    ? 'bg-blue-600 text-white shadow-blue-900/20'
                                    : 'bg-[#2a3b4d] border border-gray-700 text-gray-200'
                                    }`}
                                onClick={() => onSelectRoute && onSelectRoute(null)}
                            >
                                <p className={`text-sm font-medium leading-normal ${!selectedRoute ? 'text-white' : 'text-gray-200'}`}>All Routes</p>
                            </button>
                            {routes && routes.map((route) => {
                                const routeColor = getRouteColor(route.name);
                                const isSelected = selectedRoute?.name === route.name;
                                return (
                                    <button
                                        key={route.name}
                                        onClick={() => onSelectRoute && onSelectRoute(route)} // Pass FULL route object
                                        className={`flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-full pl-4 pr-4 shadow-md active:scale-95 active:opacity-80 border`}
                                        style={{
                                            backgroundColor: isSelected ? routeColor : '#2a3b4d',
                                            borderColor: isSelected ? routeColor : '#374151',
                                            color: isSelected ? 'white' : '#e5e7eb'
                                        }}
                                    >
                                        <p className="text-sm font-medium leading-normal">
                                            {route.name}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Navigation */}
            <div className="absolute bottom-0 w-full z-[20]">
                <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
            </div>
        </div>
    );
};

export default MobileHomePage;
