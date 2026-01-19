import { useState, useMemo, useEffect } from 'react';
import BottomNavigation from './BottomNavigation';
import MapComponent from '../Map';
import { getRouteColor } from '../../constants';

const MobileRouteDetailPage = ({ activeTab, onTabChange, route, routes, stops, onBack, userLocation, routeGeometry, onDirectionSelect, selectedServiceIndex }) => {
    const [selectedDirection, setSelectedDirection] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);



    const routeName = route?.name || 'Route A';
    const color = getRouteColor(routeName);

    // Get available trips/directions
    const serviceIdx = (selectedServiceIndex !== undefined && selectedServiceIndex >= 0) ? selectedServiceIndex : 0;
    const trips = route?.services?.[serviceIdx]?.trips || [];
    const currentTrip = trips[selectedDirection] || trips[0];
    const stopSequence = currentTrip?.stops_sequence || [];

    // Filter stops for map
    const mapStops = stops.filter(s => stopSequence.includes(s.id));

    const handleDirectionChange = (idx) => {
        setSelectedDirection(idx);
        if (onDirectionSelect && trips[idx]) {
            onDirectionSelect(routeName, trips[idx].headsign);
        }
    };



    // Calculate sheet height - fixed minimum avoids being intrusive
    const getSheetHeight = () => {
        const screenH = window.innerHeight;
        const minHeight = 230; // Slightly reduced now that handle is gone
        const maxHeight = screenH - 100;
        return isExpanded ? `${maxHeight}px` : `${minHeight}px`;
    };

    // State for time selection and sections
    const [selectedTimeStr, setSelectedTimeStr] = useState(null);
    const [openSection, setOpenSection] = useState(null);
    const [showSchedule, setShowSchedule] = useState(false);

    // Reset selection when direction changes
    useEffect(() => {
        setSelectedTimeStr(null);
        setOpenSection(null);
    }, [currentTrip]);

    // Group times logic - now de-duplicates and sorts for robustness
    const groupedTimes = useMemo(() => {
        if (!currentTrip || !currentTrip.times) return { morning: [], afternoon: [], evening: [] };

        const groups = { morning: [], afternoon: [], evening: [] };
        const now = new Date();
        const isFriday = now.getDay() === 5;

        // Use Set to remove duplicates and sort to ensure grid order is correct
        const uniqueSortedTimes = [...new Set(currentTrip.times)].sort((a, b) => a.localeCompare(b));

        uniqueSortedTimes.forEach(t => {
            const [h, m] = t.split(':').map(Number);
            const totalMins = h * 60 + m;

            if (isFriday && totalMins >= 760 && totalMins < 840) return;

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

        const service = route?.services?.[serviceIdx];
        const runsToday = service?.days?.includes(currentDay);

        if (!runsToday) {
            return { status: 'Inactive (No Service Today)', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' };
        }

        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTotalMins = currentHours * 60 + currentMinutes;

        if (currentDay === 'friday' && currentTotalMins >= 760 && currentTotalMins < 840) {
            return { status: 'Friday Prayer Break', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' };
        }

        if (currentTrip.times && currentTrip.times.length > 0) {
            const times = currentTrip.times.map(t => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            }).sort((a, b) => a - b);

            const firstBus = times[0];
            const currentTimeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
            const hasRemainingTrips = currentTrip.times.some(time => time > currentTimeStr);

            if (currentTotalMins < firstBus) {
                return { status: 'Starting Soon', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' };
            }

            if (!hasRemainingTrips) {
                return { status: 'Service Ended', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' };
            }
        }

        return { status: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' };
    }, [currentTrip, route, serviceIdx]);

    // Schedule items
    const scheduleItems = useMemo(() => {
        if (!currentTrip || !currentTrip.times || currentTrip.times.length === 0) return [];

        let startTimeStr = selectedTimeStr;

        if (!startTimeStr) {
            const now = new Date();
            const currentTotalMins = now.getHours() * 60 + now.getMinutes();

            const allValidTimes = [...groupedTimes.morning, ...groupedTimes.afternoon, ...groupedTimes.evening].sort();
            if (allValidTimes.length === 0) return [];

            startTimeStr = allValidTimes[0];
            for (const t of allValidTimes) {
                const [h, m] = t.split(':').map(Number);
                if (h * 60 + m > currentTotalMins) {
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

                <div className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${isOpen ? 'max-h-60' : 'max-h-0'}`}>
                    <div className="grid grid-cols-4 gap-2 px-5 pb-4 pt-1">
                        {times.map((time) => (
                            <button
                                key={time}
                                onClick={() => setSelectedTimeStr(time)}
                                className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedTimeStr === time
                                    ? 'bg-primary text-white shadow-md'
                                    : (scheduleItems[0]?.calculatedTime === time && !selectedTimeStr)
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
                {/* Map Area */}
                <div className="absolute inset-0 z-0">
                    <MapComponent
                        stops={mapStops}
                        routes={routes}
                        selectedRouteStops={stopSequence}
                        routeGeometry={routeGeometry}
                        routeColor={color}
                        userLocation={userLocation}
                        showArrivalInfo={true}
                        selectedRouteName={routeName}
                        selectedHeadsign={currentTrip?.headsign}
                    />

                    {/* Recenter FAB */}
                    <button
                        className="absolute right-4 bg-white dark:bg-[#1a2632] text-primary p-3 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all duration-300 ease-out z-[400]"
                        style={{ bottom: (isExpanded ? 'calc(85vh + 1rem)' : 'calc(230px + 1rem)') }}
                    >
                        <span className="material-symbols-outlined">my_location</span>
                    </button>
                </div>

                {/* Bottom Sheet */}
                <div
                    className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1a2632] rounded-t-2xl z-10 flex flex-col pt-2 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-all ease-out"
                    style={{
                        height: getSheetHeight(),
                        transitionDuration: '300ms'
                    }}
                >


                    {/* Direction Selector - More Compact */}
                    {trips.length > 1 && (
                        <div className="px-5 pb-2">
                            <div className="flex h-9 w-full items-center justify-center rounded-lg bg-[#f0f2f4] dark:bg-[#1a2633] p-1">
                                {trips.map((trip, idx) => (
                                    <label
                                        key={idx}
                                        className={`flex cursor-pointer h-full flex-1 items-center justify-center overflow-hidden rounded-md text-sm font-bold transition-all ${selectedDirection === idx
                                            ? 'bg-white dark:bg-[#2a3847] shadow-sm text-primary dark:text-blue-400'
                                            : 'text-[#617589] dark:text-gray-400'
                                            }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDirectionChange(idx);
                                        }}
                                    >
                                        <span className="truncate px-2">{trip.headsign}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Section Header - More Compact */}
                    <div className="px-5 pb-2 pt-0 border-b border-gray-800 shrink-0">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-center mb-0.5">
                                <p className="text-gray-500 dark:text-gray-400 text-[11px] font-semibold uppercase tracking-wide">
                                    {selectedTimeStr ? 'Selected Trip' : 'Next Bus'}
                                </p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${selectedTimeStr ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' : routeStatus.color}`}>
                                    {selectedTimeStr ? 'Viewing Plan' : routeStatus.status}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-2 mb-1.5">
                                <h3 className="text-white text-2xl font-bold leading-none">
                                    {scheduleItems[0]?.calculatedTime || '--:--'}
                                </h3>
                                <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">
                                    Departing • {scheduleItems.length} Stops
                                </p>
                            </div>

                            {/* Schedule Toggle Button - Compact */}
                            <button
                                onClick={() => {
                                    const nextShow = !showSchedule;
                                    setShowSchedule(nextShow);
                                    setIsExpanded(nextShow); // Also minimize/maximize the panel
                                }}
                                className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all active:scale-[0.98] ${showSchedule
                                    ? 'bg-[#f0f2f4] dark:bg-[#232e3a] text-primary dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-[#2a3847] ring-1 ring-inset ring-gray-200 dark:ring-gray-700'
                                    : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">
                                    {showSchedule ? 'expand_less' : 'calendar_clock'}
                                </span>
                                {showSchedule ? 'Hide Full Schedule' : 'View Full Schedule'}
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Content - Schedule + Stops together */}
                    <div className="flex-1 overflow-y-auto pb-20">
                        {/* Schedule Accordions - scrolls with stops */}
                        {showSchedule && (
                            <div className="flex-col bg-white dark:bg-[#1a2632] border-b border-gray-800 animate-in fade-in slide-in-from-top-1 duration-200">
                                {renderAccordion("Morning", groupedTimes.morning, 'morning')}
                                {renderAccordion("Afternoon", groupedTimes.afternoon, 'afternoon')}
                                {renderAccordion("Evening", groupedTimes.evening, 'evening')}
                            </div>
                        )}

                        {/* Timeline List */}
                        <div className="px-5 pt-4">
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
                </div>
            </main>

            {/* Bottom Navigation Bar */}
            <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
        </div>
    );
};

export default MobileRouteDetailPage;
