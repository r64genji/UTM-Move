import { useState, useEffect } from 'react';
import BottomNavigation from './BottomNavigation';
import MapComponent from '../Map';

const MobileNavigatePage = ({
    activeTab,
    onTabChange,
    onOpenSearch,
    userLocation,
    selectedOrigin,
    selectedDestination,
    mode,
    visibleStops,
    selectedStopIds,
    routeGeometry,
    walkingGeometries,
    busRouteGeometry,
    busRouteSegments,
    directionsMarkers,
    directions,
    loading,
    onClose,
    onPlanFutureTrip,
    // Pin mode props
    pinMode = null,             // 'origin' | 'destination' | null
    pinnedLocation = null,      // { lat, lon, type }
    onMapClick = null,          // (lat, lon, type) => void
    onConfirmPin = null,        // () => void
    onCancelPin = null          // () => void
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [startY, setStartY] = useState(null);
    const [currentY, setCurrentY] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [expandedSteps, setExpandedSteps] = useState({});

    const toggleStep = (index) => {
        setExpandedSteps(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    const handleTouchStart = (e) => {
        setStartY(e.touches[0].clientY);
        setIsDragging(true);
    };

    const handleTouchMove = (e) => {
        if (!isDragging) return;
        setCurrentY(e.touches[0].clientY);
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        if (startY !== null && currentY !== null) {
            const diff = startY - currentY;
            if (Math.abs(diff) > 50) { // Threshold
                if (diff > 0) {
                    setIsExpanded(true); // Swipe Up
                } else {
                    setIsExpanded(false); // Swipe Down
                }
            }
        }
        setStartY(null);
        setCurrentY(null);
    };

    const getSheetHeight = () => {
        const screenH = window.innerHeight;
        const minHeight = 220; // Increased height for spaciousness
        const maxHeight = screenH - 180;

        if (isDragging && startY !== null && currentY !== null) {
            const baseH = isExpanded ? maxHeight : minHeight;
            const diff = startY - currentY;
            let newH = baseH + diff;
            if (newH < minHeight) newH = minHeight;
            if (newH > maxHeight) newH = maxHeight;
            return `${newH}px`;
        }
        return isExpanded ? `${maxHeight}px` : `${minHeight}px`;
    };

    const getETA = () => {
        if (!directions?.summary?.totalDuration) return null;
        const now = new Date();
        const eta = new Date(now.getTime() + directions.summary.totalDuration * 60000);
        return eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const getWalkingTime = () => {
        if (!directions?.steps) return 0;
        const walkDuration = directions.steps
            .filter(step => step.type === 'walk')
            .reduce((acc, step) => acc + step.duration, 0);

        // Also add walking route duration if WALK_ONLY
        if (directions.type === 'WALK_ONLY' && directions.summary) {
            return Math.round(directions.summary.totalDuration);
        }

        return Math.round(walkDuration);
    };

    // Auto-minimize (collapse) if directions change
    useEffect(() => {
        if (directions) {
            setIsExpanded(false);
        }
    }, [directions]);

    return (
        <div className="relative h-screen w-full flex flex-col group/design-root overflow-hidden max-w-md mx-auto bg-[#101922]">
            {/* MAP BACKGROUND LAYER */}
            <div className="absolute inset-0 z-0">
                <MapComponent
                    stops={visibleStops || []}
                    selectedRouteStops={selectedStopIds || []}
                    routeGeometry={mode === 'explore' ? routeGeometry : null}
                    walkingGeometries={mode === 'directions' ? walkingGeometries : []}
                    busRouteGeometry={mode === 'directions' ? busRouteGeometry : null}
                    busRouteSegments={mode === 'directions' ? busRouteSegments : []}
                    userLocation={userLocation}
                    directionsMarkers={directionsMarkers}
                    onMapClick={onMapClick}
                    pinnedLocation={pinnedLocation}
                    pinMode={pinMode}
                />
            </div>

            {/* TOP APP BAR */}
            <div className="absolute top-0 left-0 w-full z-30 p-4 pt-4 bg-[#101922]/90 backdrop-blur-md shadow-sm">
                <div className="flex flex-col gap-3">
                    {/* Search Inputs */}
                    <div className="space-y-2">
                        <button
                            onClick={() => onOpenSearch('origin')}
                            className="w-full flex items-center gap-3 bg-[#1a2633] rounded-xl px-4 py-3 shadow-sm border border-gray-800"
                        >
                            <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                            <span className="text-gray-300 font-medium truncate">
                                {directions?.origin?.name || selectedOrigin?.name || 'Your Location'}
                            </span>
                        </button>

                        <div className="w-0.5 h-3 bg-gray-700 mx-6 rounded-full dark:bg-gray-800"></div>

                        <button
                            onClick={() => onOpenSearch('destination')}
                            className="w-full flex items-center gap-3 bg-[#1a2633] rounded-xl px-4 py-3 shadow-sm border border-gray-800"
                        >
                            <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                            <span className="text-white font-medium truncate">
                                {directions?.destination?.name || selectedDestination?.name || 'Where to?'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* MAP CONTROLS (Floating Right) */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[15] flex flex-col gap-3">
                <div className="flex flex-col gap-0.5 rounded-lg shadow-lg overflow-hidden bg-white dark:bg-[#1e293b]">
                    <button className="flex size-10 items-center justify-center bg-white dark:bg-[#1e293b] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="material-symbols-outlined text-gray-800 dark:text-white">add</span>
                    </button>
                    <div className="h-[1px] w-full bg-gray-200 dark:bg-gray-600"></div>
                    <button className="flex size-10 items-center justify-center bg-white dark:bg-[#1e293b] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="material-symbols-outlined text-gray-800 dark:text-white">remove</span>
                    </button>
                </div>
                <button className="flex size-10 items-center justify-center rounded-lg bg-white dark:bg-[#1e293b] shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <span className="material-symbols-outlined text-primary">my_location</span>
                </button>
            </div>

            {/* LOADING STATE overlay */}
            {loading && (
                <div className="absolute inset-0 z-40 bg-black/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                    <div className="bg-[#101922] rounded-2xl shadow-lg p-6 border border-gray-800 flex flex-col items-center justify-center gap-3 pointer-events-auto">
                        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                        <p className="text-gray-500 font-medium text-sm">Finding best route...</p>
                    </div>
                </div>
            )}

            {/* PIN MODE OVERLAY */}
            {pinMode && (
                <div className="absolute inset-x-0 bottom-24 z-30 px-4">
                    <div className="bg-[#101922] rounded-2xl shadow-lg p-4 border border-gray-800">
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${pinMode === 'origin' ? 'bg-blue-500/20' : 'bg-red-500/20'}`}>
                                <span className="material-symbols-outlined text-xl" style={{ color: pinMode === 'origin' ? '#3b82f6' : '#ef4444' }}>
                                    {pinMode === 'origin' ? 'trip_origin' : 'location_on'}
                                </span>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-white font-semibold">
                                    {pinMode === 'origin' ? 'Pin Start Location' : 'Pin Destination'}
                                </h3>
                                <p className="text-gray-400 text-sm">
                                    {pinnedLocation ? 'Tap confirm or tap map to change' : 'Tap anywhere on the map'}
                                </p>
                            </div>
                        </div>

                        {/* Pinned Location Info */}
                        {pinnedLocation && (
                            <div className="bg-[#1a2633] rounded-xl p-3 mb-3 border border-gray-700">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm" style={{ color: pinMode === 'origin' ? '#3b82f6' : '#ef4444' }}>
                                        push_pin
                                    </span>
                                    <span className="text-white text-sm font-medium">Pinned Location</span>
                                </div>
                                <p className="text-gray-400 text-xs mt-1">
                                    {pinnedLocation.lat.toFixed(6)}, {pinnedLocation.lon.toFixed(6)}
                                </p>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={onCancelPin}
                                className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onConfirmPin}
                                disabled={!pinnedLocation}
                                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${pinnedLocation
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DIRECTIONS SHEET */}
            {directions && !loading && (
                <div
                    className="absolute bottom-0 left-0 right-0 bg-[#101922] rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] border-t border-gray-800 overflow-hidden flex flex-col z-10 transition-all ease-out"
                    style={{
                        height: getSheetHeight(),
                        transitionDuration: isDragging ? '0ms' : '300ms'
                    }}
                >
                    {/* Drag Handle Area */}
                    <div
                        className="relative w-full shrink-0 cursor-grab active:cursor-grabbing touch-none px-5 pt-6 pb-2"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        {/* Visual Pull Bar (Bigger) */}
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-2 bg-gray-700 rounded-full shadow-inner"></div>

                        {/* Summary Header */}
                        <div className="flex flex-col gap-4">
                            {/* Title Row */}
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0 pr-2">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-white text-lg font-bold truncate">
                                            {directions.destination?.name || 'Destination'}
                                        </h3>
                                        {directions.summary?.route && (
                                            <span className="bg-blue-600/20 text-blue-400 border border-blue-400/20 px-2 py-0.5 rounded text-[10px] font-bold">
                                                {directions.summary.route}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                                        className="size-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-700 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">close</span>
                                    </button>
                                </div>
                            </div>

                            {/* Metrics Row - Spacious Flex Layout */}
                            {directions.summary && (
                                <div className="flex items-start justify-between gap-4 w-full">
                                    {/* Journey Time */}
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 truncate">Journey Time</span>
                                        <span className="text-xl font-black text-white leading-none whitespace-nowrap">~{Math.round(directions.summary.totalDuration)} min</span>
                                    </div>

                                    <div className="w-[1px] bg-gray-800 self-stretch my-1"></div>

                                    {/* Arrival Time */}
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 truncate">Arrival Time</span>
                                        <span className="text-xl font-black text-blue-500 leading-none whitespace-nowrap">{getETA() || '--:--'}</span>
                                    </div>

                                    <div className="w-[1px] bg-gray-800 self-stretch my-1"></div>

                                    {/* Walking Time */}
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 truncate">Walking</span>
                                        <span className="text-xl font-black text-gray-400 leading-none whitespace-nowrap">{getWalkingTime()} min</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className={`flex-1 overflow-y-auto pb-[100px] transition-opacity duration-300 ${!isExpanded && !isDragging ? 'opacity-0' : 'opacity-100'}`}>
                        {directions.error && (
                            <div className="p-8 text-center">
                                <span className="material-symbols-outlined text-4xl text-red-400 mb-2">error</span>
                                <p className="text-red-500 font-medium mb-1">{directions.error}</p>
                                {directions.suggestion && <p className="text-sm text-gray-500">{directions.suggestion}</p>}
                            </div>
                        )}

                        <div className="px-4 pb-4 pt-0 space-y-6">
                            {directions.steps && (
                                <div className="space-y-0 relative">
                                    <div className="absolute left-[15.5px] top-4 bottom-4 w-0.5 bg-gray-800"></div>

                                    {directions.steps.map((step, idx) => (
                                        <div key={idx} className="flex flex-col relative group">
                                            <div className={`flex gap-4 items-start py-3 bg-[#101922] sticky top-0 z-20 transition-colors ${expandedSteps[idx] ? 'border-b border-gray-800' : ''}`}>
                                                <div
                                                    className="shrink-0 size-8 rounded-full bg-[#1a2633] border-2 flex items-center justify-center shadow-sm"
                                                    style={{
                                                        borderColor: step.type === 'walk' ? '#22c55e' : (step.type === 'board' ? 'var(--border-color, #e5e7eb)' : 'transparent')
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined text-sm" style={{ color: step.type === 'walk' ? '#22c55e' : (step.type === 'board' ? '#3b82f6' : 'gray') }}>
                                                        {step.type === 'walk' ? 'directions_walk' :
                                                            step.type === 'board' ? 'directions_bus' :
                                                                step.type === 'alight' ? 'location_on' : 'arrow_downward'}
                                                    </span>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm text-white font-medium leading-normal">
                                                        {step.instruction}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-1.5 opacity-80">
                                                        {step.time && (
                                                            <span className="text-[11px] font-bold text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                                {step.time}
                                                            </span>
                                                        )}
                                                        {step.duration > 0 && (
                                                            <span className="text-xs text-gray-400 font-medium">
                                                                {step.duration} min
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Show/Hide Button */}
                                                {step.type === 'walk' && step.details && step.details.length > 0 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); toggleStep(idx); }}
                                                        className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-800 text-xs font-medium text-gray-300 border border-gray-700 active:bg-gray-700 transition-colors shadow-sm"
                                                    >
                                                        {expandedSteps[idx] ? 'Hide' : 'Show'}
                                                    </button>
                                                )}
                                            </div>




                                            {/* Expandable Details */}
                                            {
                                                step.type === 'walk' && expandedSteps[idx] && step.details && (
                                                    <div className="ml-12 pl-4 border-l-2 border-dashed border-gray-700/50 space-y-3 py-2">
                                                        {step.details.map((detail, i) => (
                                                            <div key={i} className="relative">
                                                                <div className="flex gap-3">
                                                                    <span className="material-symbols-outlined text-gray-500 text-sm mt-0.5">
                                                                        {detail.type === 'turn_left' ? 'turn_left' :
                                                                            detail.type === 'turn_right' ? 'turn_right' :
                                                                                'straight'}
                                                                    </span>
                                                                    <div>
                                                                        <p className="text-xs text-gray-300">{detail.instruction}</p>
                                                                        <p className="text-[10px] text-gray-500">{detail.distance}m</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )
                                            }
                                        </div>
                                    ))}
                                </div>
                            )}

                            {directions.type === 'WALK_ONLY' && !directions.error && (
                                <div className="space-y-4">
                                    {/* Header */}
                                    <div className="bg-green-50 dark:bg-green-900/10 rounded-2xl p-4 text-center border border-green-100 dark:border-green-900/20">
                                        <div className="flex items-center justify-center gap-3">
                                            <div className="size-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                                                <span className="material-symbols-outlined text-xl text-green-600 dark:text-green-400">directions_walk</span>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-green-800 dark:text-green-300 font-semibold">{directions.message}</p>
                                                <p className="text-sm text-green-600/80 dark:text-green-400/60">
                                                    {directions.totalWalkingDistance}m • ~{directions.totalDuration} min
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Step-by-step directions */}
                                    {directions.walkingSteps && directions.walkingSteps.length > 0 && (
                                        <div className="space-y-0 relative">
                                            <div className="absolute left-[15.5px] top-4 bottom-4 w-0.5 bg-gray-800"></div>

                                            {directions.walkingSteps.map((step, idx) => (
                                                <div key={idx} className="flex gap-4 relative py-2.5 group">
                                                    <div className="shrink-0 size-8 rounded-full bg-[#1a2633] border-2 border-green-500/30 flex items-center justify-center z-10 shadow-sm">
                                                        <span className="material-symbols-outlined text-sm text-green-400">
                                                            {step.type === 'turn_left' || step.type === 'turn_sharp_left' || step.type === 'turn_slight_left' ? 'turn_left' :
                                                                step.type === 'turn_right' || step.type === 'turn_sharp_right' || step.type === 'turn_slight_right' ? 'turn_right' :
                                                                    step.type === 'destination' ? 'location_on' :
                                                                        step.type === 'depart' ? 'trip_origin' :
                                                                            step.type === 'u_turn' ? 'u_turn_left' :
                                                                                'arrow_upward'}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm text-white font-medium leading-normal">
                                                            {step.instruction}
                                                        </p>
                                                        {step.distance > 0 && (
                                                            <p className="text-xs text-gray-500 mt-0.5">
                                                                {step.distance}m
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Alternative bus option */}
                                    {directions.alternativeBus && (
                                        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3 border border-blue-100 dark:border-blue-900/20">
                                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Or take a bus:</p>
                                            <p className="text-sm text-blue-800 dark:text-blue-300">
                                                {directions.alternativeBus.routeName} arrives in {directions.alternativeBus.minutesUntil} min
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div >
                </div >
            )
            }

            {/* BOTTOM NAVIGATION BAR */}
            <div className="absolute bottom-0 w-full z-[20]">
                <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
            </div>
        </div >
    );
};

export default MobileNavigatePage;
