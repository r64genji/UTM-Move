import { useState, useMemo } from 'react';
import BottomNavigation from './BottomNavigation';
import MapComponent from '../Map';

const ROUTE_COLORS = {
    'A': '#EF4444', 'B': '#F59E0B', 'C': '#10B981', 'D': '#3B82F6',
    'E': '#8B5CF6', 'F': '#EC4899', 'G': '#14b8a6', 'L': '#6366F1'
};

const getRouteColor = (routeName) => {
    if (!routeName) return '#3b82f6';
    const match = routeName.match(/Route\s+([A-Z])/i);
    const letter = match ? match[1].toUpperCase() : 'A';
    return ROUTE_COLORS[letter] || '#3b82f6';
};

const MobileRouteDetailPage = ({ activeTab, onTabChange, route, stops, onBack, userLocation, routeGeometry, onDirectionSelect, selectedServiceIndex }) => {
    const [selectedDirection, setSelectedDirection] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);

    // Drag logic state
    const [startY, setStartY] = useState(null);
    const [currentY, setCurrentY] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    const routeName = route?.name || 'Route A';
    const color = getRouteColor(routeName);

    // Get available trips/directions
    const serviceIdx = (selectedServiceIndex !== undefined && selectedServiceIndex >= 0) ? selectedServiceIndex : 0;
    const trips = route?.services?.[serviceIdx]?.trips || [];
    const currentTrip = trips[selectedDirection] || trips[0];
    const stopSequence = currentTrip?.stops_sequence || [];

    // Filter stops for map
    const mapStops = stops.filter(s => stopSequence.includes(s.id));

    // Debug logging
    // console.log('[MobileRouteDetail] routeName:', routeName);
    // console.log('[MobileRouteDetail] routeGeometry:', routeGeometry ? 'Loaded' : 'Null');
    // console.log('[MobileRouteDetail] mapStops:', mapStops.length);

    const handleDirectionChange = (idx) => {
        setSelectedDirection(idx);
        if (onDirectionSelect && trips[idx]) {
            console.log('[MobileRouteDetail] Changing direction to:', trips[idx].headsign);
            onDirectionSelect(routeName, trips[idx].headsign);
        }
    };

    // Touch Handlers
    const handleTouchStart = (e) => {
        setStartY(e.touches[0].clientY);
        setIsDragging(true);
    };

    const handleTouchMove = (e) => {
        if (!isDragging) return;
        const y = e.touches[0].clientY;
        setCurrentY(y);
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

    // Calculate height dynamically during drag
    const getSheetHeight = () => {
        const screenH = window.innerHeight;
        const minHeight = screenH * 0.30;
        const maxHeight = screenH - 120; // Leave space for the header at the top

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

    // State for time selection and sections
    const [selectedTimeStr, setSelectedTimeStr] = useState(null);
    const [openSection, setOpenSection] = useState(null); // 'morning', 'afternoon', 'evening', or null
    const [showSchedule, setShowSchedule] = useState(false); // Toggle for full schedule view

    // Effect to reset selection when direction changes
    useMemo(() => {
        setSelectedTimeStr(null);
        setOpenSection(null);
    }, [currentTrip]);

    // Group times logic
    const groupedTimes = useMemo(() => {
        if (!currentTrip || !currentTrip.times) return { morning: [], afternoon: [], evening: [] };

        const groups = {
            morning: [],
            afternoon: [],
            evening: []
        };

        const now = new Date();
        const isFriday = now.getDay() === 5;

        currentTrip.times.forEach(t => {
            const [h, m] = t.split(':').map(Number);
            const totalMins = h * 60 + m;

            // Friday logic check
            if (isFriday) {
                // Exclude 12:40 (760) -> 14:00 (840)
                if (totalMins >= 760 && totalMins < 840) return;
            }

            if (h < 12) groups.morning.push(t);
            else if (h < 18) groups.afternoon.push(t);
            else groups.evening.push(t);
        });

        return groups;
    }, [currentTrip]);

    // Active Status Logic
    const routeStatus = useMemo(() => {
        if (!currentTrip) return { status: 'Inactive', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' };

        const now = new Date();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = days[now.getDay()];

        // 1. Check Service Day Validity
        const service = route?.services?.[serviceIdx];
        const runsToday = service?.days?.includes(currentDay);

        if (!runsToday) {
            return {
                status: 'Inactive (No Service Today)',
                color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
            };
        }

        // 2. Check Friday Prayer
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTotalMins = currentHours * 60 + currentMinutes;

        if (currentDay === 'friday' && currentTotalMins >= 760 && currentTotalMins < 840) { // 12:40 - 14:00
            return {
                status: 'Friday Prayer Break',
                color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
            };
        }

        // 3. Check Operating Hours
        if (currentTrip.times && currentTrip.times.length > 0) {
            const times = currentTrip.times.map(t => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            }).sort((a, b) => a - b);

            const firstBus = times[0];
            const lastBus = times[times.length - 1];

            // Check if there are any remaining trips for this headsign
            const currentTimeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
            const hasRemainingTrips = currentTrip.times.some(time => time > currentTimeStr);

            if (currentTotalMins < firstBus) {
                return {
                    status: 'Starting Soon',
                    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                };
            }

            if (!hasRemainingTrips) {
                return {
                    status: 'Service Ended',
                    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                };
            }
        }

        return {
            status: 'Active',
            color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
        };

    }, [currentTrip, route, serviceIdx]);

    // Calculate dynamic schedule items based on selected time or next available
    const scheduleItems = useMemo(() => {
        if (!currentTrip || !currentTrip.times || currentTrip.times.length === 0) return [];

        let startTimeStr = selectedTimeStr;

        if (!startTimeStr) {
            // Logic to check *next* bus time if none selected
            const now = new Date();
            const currentHours = now.getHours();
            const currentMinutes = now.getMinutes();
            const currentTotalMins = currentHours * 60 + currentMinutes;

            // Get all valid times from our groups
            const allValidTimes = [
                ...groupedTimes.morning,
                ...groupedTimes.afternoon,
                ...groupedTimes.evening
            ].sort();

            if (allValidTimes.length === 0) return [];

            startTimeStr = allValidTimes[0]; // Default to first

            // Find next
            for (const t of allValidTimes) {
                const [h, m] = t.split(':').map(Number);
                const tTotal = h * 60 + m;
                if (tTotal > currentTotalMins) {
                    startTimeStr = t;
                    break;
                }
            }
        }

        const [startH, startM] = startTimeStr.split(':').map(Number);

        return stopSequence.map((stopId, index) => {
            const stop = stops?.find(s => s.id === stopId) || { id: stopId, name: stopId };
            let calculatedTime = "";

            if (currentTrip.arrival_offsets && currentTrip.arrival_offsets[index] !== undefined) {
                const offsetMins = currentTrip.arrival_offsets[index];
                const totalMins = startH * 60 + startM + offsetMins;
                const h = Math.floor(totalMins / 60) % 24;
                const m = totalMins % 60;
                calculatedTime = `${h}:${m.toString().padStart(2, '0')}`;
            } else {
                // Fallback estimate: 3 mins per stop
                const totalMins = startH * 60 + startM + (index * 3);
                const h = Math.floor(totalMins / 60) % 24;
                const m = totalMins % 60;
                calculatedTime = `${h}:${m.toString().padStart(2, '0')}`;
            }

            return {
                ...stop,
                calculatedTime,
                offsetMins: currentTrip.arrival_offsets ? currentTrip.arrival_offsets[index] : index * 3
            };
        });
    }, [currentTrip, stopSequence, stops, selectedTimeStr, groupedTimes]);

    const toggleSection = (section) => {
        setOpenSection(openSection === section ? null : section);
    };

    const renderAccordion = (title, times, sectionKey) => {
        const isOpen = openSection === sectionKey;
        if (times.length === 0) return null;

        return (
            <div className="border-b border-gray-800 last:border-0">
                <button
                    onClick={() => toggleSection(sectionKey)}
                    className="flex w-full items-center justify-between py-3 px-5 hover:bg-gray-50 dark:hover:bg-[#232e3a] transition-colors"
                >
                    <span className="font-bold text-sm text-white flex items-center gap-2">
                        {sectionKey === 'morning' && <span className="material-symbols-outlined text-orange-400 text-[18px]">wb_sunny</span>}
                        {sectionKey === 'afternoon' && <span className="material-symbols-outlined text-yellow-500 text-[18px]">light_mode</span>}
                        {sectionKey === 'evening' && <span className="material-symbols-outlined text-indigo-400 text-[18px]">bedtime</span>}
                        {title}
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] text-gray-500 font-medium">
                            {times.length}
                        </span>
                    </span>
                    <span className={`material-symbols-outlined text-gray-400 text-[20px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                        expand_more
                    </span>
                </button>

                <div
                    className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${isOpen ? 'max-h-60' : 'max-h-0'}`}
                >
                    <div className="grid grid-cols-4 gap-2 px-5 pb-4 pt-1">
                        {times.map((time) => (
                            <button
                                key={time}
                                onClick={() => {
                                    setSelectedTimeStr(time);
                                    // Optional: close section after selection? 
                                    // setOpenSection(null);
                                }}
                                className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedTimeStr === time
                                    ? 'bg-primary text-white shadow-md'
                                    : (scheduleItems[0]?.calculatedTime === time && !selectedTimeStr) // Highlight if it's the auto-selected "next" time
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-primary dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                        : 'bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                            >
                                {time}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-[#101922] font-display text-white antialiased overflow-hidden flex flex-col h-[100dvh] w-full max-w-md mx-auto">
            {/* Fixed Header */}
            <header className="flex items-center bg-white dark:bg-[#1a2632] p-4 pb-2 justify-between shrink-0 shadow-sm z-20">
                <button
                    onClick={onBack}
                    className="text-white flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-gray-800 transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back_ios_new</span>
                </button>
                <h2 className="text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">
                    {routeName}
                </h2>
                <div className="flex w-12 items-center justify-end">
                    <button className="flex size-12 cursor-pointer items-center justify-center rounded-full text-white hover:bg-gray-800 transition-colors">
                        <span className="material-symbols-outlined">favorite_border</span>
                    </button>
                </div>
            </header>

            {/* Content Container */}
            <main className="flex-1 relative overflow-hidden h-full">
                {/* Map Area (Full Background) */}
                <div className="absolute inset-0 z-0">
                    <MapComponent
                        stops={mapStops}
                        selectedRouteStops={stopSequence}
                        routeGeometry={routeGeometry}
                        routeColor={color}
                        userLocation={userLocation}
                    />

                    {/* Recenter FAB */}
                    <button
                        className="absolute right-4 bg-white dark:bg-[#1a2632] text-primary p-3 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all duration-300 ease-out z-[400]"
                        style={{ bottom: isDragging ? 'calc(' + getSheetHeight() + ' + 1rem)' : (isExpanded ? 'calc(85vh + 1rem)' : 'calc(30vh + 1rem)') }}
                    >
                        <span className="material-symbols-outlined">my_location</span>
                    </button>
                </div>

                {/* Bottom Sheet / Stop List */}
                <div
                    className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1a2632] rounded-t-2xl z-10 flex flex-col shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-all ease-out"
                    style={{
                        height: getSheetHeight(),
                        transitionDuration: isDragging ? '0ms' : '300ms'
                    }}
                >
                    {/* Drag Handle */}
                    <div
                        className="flex justify-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        <div className="h-1.5 w-12 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                    </div>

                    {/* Direction Selector */}
                    {trips.length > 1 && (
                        <div className="px-5 pb-3">
                            <div className="flex h-10 w-full items-center justify-center rounded-lg bg-[#f0f2f4] dark:bg-[#1a2633] p-1">
                                {trips.map((trip, idx) => (
                                    <label
                                        key={idx}
                                        className={`flex cursor-pointer h-full flex-1 items-center justify-center overflow-hidden rounded-md text-sm font-bold transition-all ${selectedDirection === idx
                                            ? 'bg-white dark:bg-[#2a3847] shadow-sm text-primary dark:text-blue-400'
                                            : 'text-[#617589] dark:text-gray-400'
                                            }`}
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevent sheet toggle
                                            handleDirectionChange(idx);
                                        }}
                                    >
                                        <span className="truncate px-2">{trip.headsign}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Schedule Accordions - Moved below */}
                    {/* was here */}

                    {/* Section Header */}
                    <div className="px-5 pb-4 pt-4 border-b border-gray-800 shrink-0">
                        <div className="flex flex-col">
                            {/* Top Row: Context & Status */}
                            <div className="flex justify-between items-center mb-1">
                                <p className="text-gray-500 dark:text-gray-400 text-sm font-semibold uppercase tracking-wide">
                                    {selectedTimeStr ? 'Selected Trip' : 'Status'}
                                </p>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedTimeStr ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' : routeStatus.color}`}>
                                    {selectedTimeStr ? 'Viewing Plan' : routeStatus.status}
                                </span>
                            </div>

                            {/* Main Info: Time */}
                            <div className="flex items-baseline gap-2 mb-4">
                                <h3 className="text-white text-3xl font-bold leading-none">
                                    {scheduleItems[0]?.calculatedTime || '--:--'}
                                </h3>
                                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                                    Departing • {scheduleItems.length} Stops
                                </p>
                            </div>

                            {/* Action Button: Toggle Schedule */}
                            <button
                                onClick={() => {
                                    const newShowSchedule = !showSchedule;
                                    setShowSchedule(newShowSchedule);
                                    // Expand panel when showing schedule
                                    if (newShowSchedule) {
                                        setIsExpanded(true);
                                    }
                                }}
                                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all active:scale-[0.98] ${showSchedule
                                    ? 'bg-gray-800 text-gray-700 dark:text-gray-300'
                                    : 'bg-[#f0f2f4] dark:bg-[#232e3a] text-primary dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-[#2a3847] ring-1 ring-inset ring-gray-200 dark:ring-gray-700'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {showSchedule ? 'expand_less' : 'calendar_clock'}
                                </span>
                                {showSchedule ? 'Hide Full Schedule' : 'View Full Schedule'}
                            </button>
                        </div>
                    </div>

                    {/* Schedule Accordions - Conditional Render */}
                    {showSchedule && (
                        <div className="flex-col bg-white dark:bg-[#1a2632] border-b border-gray-800 animate-in fade-in slide-in-from-top-1 duration-200">
                            {renderAccordion("Morning", groupedTimes.morning, 'morning')}
                            {renderAccordion("Afternoon", groupedTimes.afternoon, 'afternoon')}
                            {renderAccordion("Evening", groupedTimes.evening, 'evening')}
                        </div>
                    )}

                    {/* Timeline List (Scrollable) */}
                    <div className="flex-1 overflow-y-auto pb-24 px-5 pt-4">
                        {scheduleItems.map((item, idx) => (
                            <div key={`${item.id}-${idx}`} className="grid grid-cols-[32px_1fr] gap-x-3">
                                <div className="flex flex-col items-center">
                                    {idx > 0 && <div className="w-0.5 h-2" style={{ backgroundColor: `${color}30` }}></div>}
                                    {idx === 0 ? (
                                        <div
                                            className="relative z-10 flex items-center justify-center size-8 rounded-full shadow-md"
                                            style={{ backgroundColor: color }}
                                        >
                                            <span className="material-symbols-outlined text-white text-[18px]">directions_bus</span>
                                        </div>
                                    ) : (
                                        <div
                                            className="size-4 rounded-full border-[3px] bg-white dark:bg-[#1a2632]"
                                            style={{ borderColor: item.offsetMins < 10 ? color : '#d1d5db' }}
                                        ></div>
                                    )}
                                    {idx < scheduleItems.length - 1 && (
                                        <div
                                            className="w-0.5 h-full grow min-h-[2rem]"
                                            style={{ backgroundColor: item.offsetMins < 10 ? `${color}30` : '#e5e7eb' }}
                                        ></div>
                                    )}
                                </div>
                                <div className={`flex flex-1 flex-col pb-6 ${idx === 0 ? 'pt-1' : ''}`}>
                                    <div className="flex justify-between items-center h-full">
                                        <div>
                                            <p className={`text-base leading-tight ${idx === 0
                                                ? 'font-bold'
                                                : item.offsetMins < 10
                                                    ? 'font-medium text-white'
                                                    : 'font-medium text-gray-500 dark:text-gray-400'
                                                }`} style={idx === 0 ? { color } : {}}>
                                                {item.name}
                                            </p>
                                            {idx === 0 && <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Departing</p>}
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className={`text-sm font-bold ${idx === 0 ? 'text-primary' : 'text-white'}`}>
                                                {item.calculatedTime}
                                            </span>
                                            {idx > 0 && (
                                                <span className="text-[10px] text-gray-400 font-medium">
                                                    +{item.offsetMins} min
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {/* Bottom Navigation Bar */}
            <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
        </div>
    );
};

export default MobileRouteDetailPage;
