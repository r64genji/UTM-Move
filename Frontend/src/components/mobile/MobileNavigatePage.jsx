import { useState, useEffect } from 'react';
import BottomNavigation from './BottomNavigation';
import MapComponent from '../Map';

const MobileNavigatePage = ({
    activeTab,
    onTabChange,
    onOpenSearch,
    userLocation,
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
    onPlanFutureTrip
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [startY, setStartY] = useState(null);
    const [currentY, setCurrentY] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

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
        const minHeight = 150; // Compact height to fit header content only
        const maxHeight = screenH - 180; // Leave space for search inputs at the top

        if (isDragging && startY !== null && currentY !== null) {
            const baseH = isExpanded ? maxHeight : minHeight;
            const diff = startY - currentY;
            let newH = baseH + diff;

            // Constrain
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
                            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-lg">my_location</span>
                            </div>
                            <span className={`text-sm ${userLocation && userLocation.name ? 'text-white font-medium' : 'text-[#617589] dark:text-gray-400'}`}>
                                {userLocation && userLocation.name ? userLocation.name : "Your location"}
                            </span>
                        </button>
                        <button
                            onClick={() => onOpenSearch('destination')}
                            className="w-full flex items-center gap-3 bg-[#1a2633] rounded-xl px-4 py-3 shadow-sm border border-gray-800"
                        >
                            <div className="size-8 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                                <span className="material-symbols-outlined text-red-500 text-lg">location_on</span>
                            </div>
                            <span className={`text-sm ${directions?.destination?.name ? 'text-white font-medium' : 'text-[#617589] dark:text-gray-400'}`}>
                                {directions?.destination?.name || "Where to?"}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* MAP CONTROLS (Floating Right) */}
            <div className="absolute right-4 top-56 z-[15] flex flex-col gap-3">
                <div className="flex flex-col gap-0.5 rounded-lg shadow-lg overflow-hidden bg-white dark:bg-[#1e293b]">
                    <button className="flex size-10 items-center justify-center bg-white dark:bg-[#1e293b] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="material-symbols-outlined text-white">add</span>
                    </button>
                    <div className="h-[1px] w-full bg-gray-200 dark:bg-gray-600"></div>
                    <button className="flex size-10 items-center justify-center bg-white dark:bg-[#1e293b] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="material-symbols-outlined text-white">remove</span>
                    </button>
                </div>
                <button className="flex size-10 items-center justify-center rounded-lg bg-white dark:bg-[#1e293b] shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <span className="material-symbols-outlined text-primary">my_location</span>
                </button>
            </div>

            {/* LOADING STATE */}
            {loading && (
                <div className="absolute bottom-[88px] left-0 right-0 z-20 px-4 pointer-events-none">
                    <div className="bg-[#101922] rounded-2xl shadow-lg p-6 border border-gray-800 flex flex-col items-center justify-center gap-3 pointer-events-auto">
                        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                        <p className="text-gray-500 font-medium text-sm">Finding best route...</p>
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
                        className="shrink-0 cursor-grab active:cursor-grabbing touch-none px-4 pt-3"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        {/* Pull Bar */}
                        <div className="w-full flex justify-center pb-2">
                            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                        </div>

                        {/* Header Content */}
                        <div className="flex items-center justify-between pb-3 border-b border-gray-800/50">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-white text-lg font-bold">
                                        {directions.destination?.name || 'Destination'}
                                    </h3>
                                    {directions.summary?.route && (
                                        <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded text-[10px] font-bold">
                                            {directions.summary.route}
                                        </span>
                                    )}
                                </div>
                                {directions.summary && (
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        ~{Math.round(directions.summary.totalDuration)} min • {getETA() && <span className="font-bold text-gray-700 dark:text-gray-300">{getETA()} Arrival</span>}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onClose(); }}
                                className="size-9 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
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

                        <div className="p-4 space-y-6">
                            {directions.steps && (
                                <div className="space-y-0 relative">
                                    <div className="absolute left-[15.5px] top-4 bottom-4 w-0.5 bg-gray-800"></div>

                                    {directions.steps.slice(1).map((step, idx) => (
                                        <div key={idx} className="flex gap-4 relative py-3 group">
                                            <div className="shrink-0 size-8 rounded-full bg-[#1a2633] border-2 border-gray-100 dark:border-gray-700 flex items-center justify-center z-10 shadow-sm">
                                                <span className="material-symbols-outlined text-sm text-primary dark:text-blue-400">
                                                    {step.type === 'walk' ? 'directions_walk' :
                                                        step.type === 'board' ? 'directions_bus' :
                                                            step.type === 'alight' ? 'location_on' : 'arrow_downward'}
                                                </span>
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm text-white font-medium leading-normal">
                                                    {step.instruction}
                                                </p>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    {step.time && (
                                                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
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
                                        </div>
                                    ))}
                                </div>
                            )}

                            {directions.type === 'WALK_ONLY' && !directions.error && (
                                <div className="bg-green-50 dark:bg-green-900/10 rounded-2xl p-6 text-center border border-green-100 dark:border-green-900/20">
                                    <div className="size-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <span className="material-symbols-outlined text-2xl text-green-600 dark:text-green-400">directions_walk</span>
                                    </div>
                                    <p className="text-green-800 dark:text-green-300 font-semibold mb-1">{directions.message}</p>
                                    <p className="text-sm text-green-600/80 dark:text-green-400/60 font-medium">
                                        {directions.totalWalkingDistance}m distance
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* BOTTOM NAVIGATION BAR */}
            <div className="absolute bottom-0 w-full z-[20]">
                <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
            </div>
        </div >
    );
};

export default MobileNavigatePage;
