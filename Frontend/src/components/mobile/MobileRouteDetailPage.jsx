import { useState, useMemo, useEffect } from 'react';
import BottomNavigation from './BottomNavigation';
import MapComponent from '../Map';
import ReportDialog from '../ReportDialog';
import { getRouteColor } from '../../constants';

const MobileRouteDetailPage = ({ activeTab, onTabChange, route, routes, stops, onBack, userLocation, routeGeometry, onDirectionSelect, selectedServiceIndex }) => {
    // 1. State Definitions
    const [selectedDirection, setSelectedDirection] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showReportDialog, setShowReportDialog] = useState(false);

    // Pull to refresh/expand logic state
    const [startY, setStartY] = useState(null);
    const [currentY, setCurrentY] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    // Schedule view state
    const [selectedTimeStr, setSelectedTimeStr] = useState(null);
    const [openSection, setOpenSection] = useState(null);
    const [showSchedule, setShowSchedule] = useState(false);

    // State for selected variant (for merged Route E)
    const [selectedVariant, setSelectedVariant] = useState(null);

    // 2. Derived Values
    const routeName = route?.displayName || route?.name || 'Route A';
    const color = getRouteColor(routeName);
    const isMergedRouteE = route?.isMerged && route?.name === 'Route E';
    const serviceIdx = (selectedServiceIndex !== undefined && selectedServiceIndex >= 0) ? selectedServiceIndex : 0;

    // 3. Complex Memos (Data Processing)

    // For merged Route E, create unified trips that combine all variants by headsign
    const unifiedTrips = useMemo(() => {
        if (!isMergedRouteE || !route?.variants) {
            return route?.services?.[serviceIdx]?.trips || [];
        }

        // Group trips by normalized headsign (e.g., "To Cluster (T02)" or "To KDOJ")
        const headsignMap = new Map();

        route.variants.forEach(variant => {
            const weekdayService = variant.services?.find(s => s.service_id === 'WEEKDAY');
            weekdayService?.trips?.forEach(trip => {
                // Normalize headsign - some variants have slightly different names
                let normalizedHeadsign = trip.headsign;

                // Get or create entry for this headsign
                if (!headsignMap.has(normalizedHeadsign)) {
                    headsignMap.set(normalizedHeadsign, {
                        headsign: normalizedHeadsign,
                        stops_sequence: trip.stops_sequence, // Use first variant's stops as default
                        times: [],
                        arrival_offsets: trip.arrival_offsets,
                        mergedTimes: [] // Array of { time, variant, variantLabel, stops_sequence, arrival_offsets }
                    });
                }

                const entry = headsignMap.get(normalizedHeadsign);
                const variantLabel = variant.name.match(/\(([^)]+)\)/)?.[1] || '';

                // Add times with variant info
                trip.times?.forEach(time => {
                    entry.mergedTimes.push({
                        time,
                        variant: variant.name,
                        variantLabel,
                        stops_sequence: trip.stops_sequence,
                        arrival_offsets: trip.arrival_offsets
                    });
                    // Also add to times array for backward compatibility
                    if (!entry.times.includes(time)) {
                        entry.times.push(time);
                    }
                });
            });
        });

        // Sort times and mergedTimes within each headsign and convert to array
        return Array.from(headsignMap.values()).map(entry => ({
            ...entry,
            times: [...entry.times].sort(),
            mergedTimes: entry.mergedTimes.sort((a, b) => a.time.localeCompare(b.time))
        }));
    }, [isMergedRouteE, route, serviceIdx]);

    const trips = isMergedRouteE ? unifiedTrips : (route?.services?.[serviceIdx]?.trips || []);
    const currentTrip = trips[selectedDirection] || trips[0];
    const stopSequence = currentTrip?.stops_sequence || [];

    // For merged Route E, find the actual variant route for geometry
    const activeVariantRoute = useMemo(() => {
        if (!isMergedRouteE || !selectedVariant) return null;
        return route.variants?.find(v => v.name === selectedVariant);
    }, [isMergedRouteE, selectedVariant, route]);

    // Filter stops for map - use variant's stops if available
    const mapStops = useMemo(() => {
        if (activeVariantRoute && currentTrip) {
            const variantService = activeVariantRoute.services?.find(s => s.service_id === 'WEEKDAY');
            const variantTrip = variantService?.trips?.find(t => t.headsign === currentTrip?.headsign);
            if (variantTrip?.stops_sequence) {
                return stops.filter(s => variantTrip.stops_sequence.includes(s.id));
            }
        }
        return stops.filter(s => stopSequence.includes(s.id));
    }, [activeVariantRoute, stopSequence, stops, currentTrip]);

    // Group times logic - handles merged Route E with variant labels
    const groupedTimes = useMemo(() => {
        const groups = { morning: [], afternoon: [], evening: [] };
        const now = new Date();
        const isFriday = now.getDay() === 5;

        // For merged Route E, use mergedTimes which has variant info
        if (route?.name === 'Route J') {
            route.services.forEach(service => {
                const trip = service.trips.find(t => t.headsign === currentTrip?.headsign);
                if (trip && trip.times) {
                    trip.times.forEach(t => {
                        const [h, m] = t.split(':').map(Number);
                        const totalMins = h * 60 + m;
                        if (isFriday && totalMins >= 760 && totalMins < 840) return;

                        // Check if time already exists to avoid duplicates (though rare for distinct services)
                        const exists = groups.morning.concat(groups.afternoon, groups.evening)
                            .some(existing => existing.time === t);

                        const label = service.service_id === 'TUESDAY' ? 'Tuesday Only' : 'Weekday';

                        const timeEntry = {
                            time: t,
                            variant: service.service_id,
                            variantLabel: label
                        };

                        if (!exists) {
                            if (h < 12) groups.morning.push(timeEntry);
                            else if (h < 18) groups.afternoon.push(timeEntry);
                            else groups.evening.push(timeEntry);
                        }
                    });
                }
            });

            // Sort groups
            ['morning', 'afternoon', 'evening'].forEach(key => {
                groups[key].sort((a, b) => {
                    const [h1, m1] = a.time.split(':').map(Number);
                    const [h2, m2] = b.time.split(':').map(Number);
                    return (h1 * 60 + m1) - (h2 * 60 + m2);
                });
            });

        } else if (isMergedRouteE && currentTrip?.mergedTimes) {
            currentTrip.mergedTimes.forEach(entry => {
                const [h, m] = entry.time.split(':').map(Number);
                const totalMins = h * 60 + m;
                if (isFriday && totalMins >= 760 && totalMins < 840) return;

                const timeEntry = {
                    time: entry.time,
                    variant: entry.variant,
                    variantLabel: entry.variantLabel,
                    stops_sequence: entry.stops_sequence,
                    arrival_offsets: entry.arrival_offsets
                };
                if (h < 12) groups.morning.push(timeEntry);
                else if (h < 18) groups.afternoon.push(timeEntry);
                else groups.evening.push(timeEntry);
            });
        } else if (!currentTrip || !currentTrip.times) {
            return groups;
        } else {
            // Standard route - no variant labels
            const uniqueSortedTimes = [...new Set(currentTrip.times)].sort();
            uniqueSortedTimes.forEach(t => {
                const [h, m] = t.split(':').map(Number);
                const totalMins = h * 60 + m;
                if (isFriday && totalMins >= 760 && totalMins < 840) return;

                const timeEntry = { time: t, variant: null, variantLabel: null };
                if (h < 12) groups.morning.push(timeEntry);
                else if (h < 18) groups.afternoon.push(timeEntry);
                else groups.evening.push(timeEntry);
            });
        }

        return groups;
    }, [currentTrip, isMergedRouteE, route]);

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

        let timesToCheck = currentTrip.times;

        // For Route J (or merged Route E), use the merged times from groupedTimes to calculate status
        if ((route?.name === 'Route J' || isMergedRouteE) && groupedTimes) {
            const allMergedTimes = [...groupedTimes.morning, ...groupedTimes.afternoon, ...groupedTimes.evening]
                .map(t => typeof t === 'string' ? t : t.time);
            if (allMergedTimes.length > 0) {
                timesToCheck = allMergedTimes;
            }
        }

        if (timesToCheck && timesToCheck.length > 0) {
            const times = timesToCheck.map(t => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            }).sort((a, b) => a - b);

            const firstBus = times[0];
            const currentTimeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
            const hasRemainingTrips = timesToCheck.some(time => time > currentTimeStr);

            if (currentTotalMins < firstBus) {
                return { status: 'Starting Soon', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' };
            }

            if (!hasRemainingTrips) {
                return { status: 'Service Ended', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' };
            }
        }

        return { status: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' };
    }, [currentTrip, route, serviceIdx, groupedTimes, isMergedRouteE]);

    // Schedule items
    const scheduleItems = useMemo(() => {
        if (!currentTrip || !currentTrip.times || currentTrip.times.length === 0) return [];

        let startTimeStr = selectedTimeStr;

        if (!startTimeStr) {
            const now = new Date();
            const currentTotalMins = now.getHours() * 60 + now.getMinutes();

            // Extract time strings from time entries (which may be objects or strings)
            const allValidTimes = [...groupedTimes.morning, ...groupedTimes.afternoon, ...groupedTimes.evening]
                .map(entry => typeof entry === 'string' ? entry : entry.time)
                .sort();
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

    // 4. Effects

    // Reset selection when direction changes
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: resetting selection in effect when currentTrip/isMergedRouteE changes.
        setSelectedTimeStr(null);
        setOpenSection(null);
        if (isMergedRouteE) {
            setSelectedVariant(null);
        }
    }, [currentTrip, isMergedRouteE]);

    // For merged Route E: Set default variant on initial load
    useEffect(() => {
        if (isMergedRouteE && !selectedVariant && currentTrip?.mergedTimes?.length > 0) {
            const now = new Date();
            const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const nextDeparture = currentTrip.mergedTimes.find(entry => entry.time >= currentTimeStr);
            if (nextDeparture) {
                // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: setting default variant based on dep change.
                setSelectedVariant(nextDeparture.variant);
            } else if (currentTrip.mergedTimes[0]) {
                // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: fallback to first variant.
                setSelectedVariant(currentTrip.mergedTimes[0].variant);
            }
        }
    }, [isMergedRouteE, selectedVariant, currentTrip]);

    // For merged Route E: Update geometry when a variant is selected
    useEffect(() => {
        if (isMergedRouteE && selectedVariant && currentTrip && onDirectionSelect) {
            // Use the variant's route name for geometry lookup (e.g., "Route E(JA)")
            onDirectionSelect(selectedVariant, currentTrip.headsign);
        }
    }, [selectedVariant, currentTrip, isMergedRouteE, onDirectionSelect]);

    // 5. Handlers
    const handleTouchStart = (e) => {
        setStartY(e.touches[0].clientY);
        setIsDragging(true);
    };

    const handleTouchMove = (e) => {
        if (!isDragging) return;
        const y = e.touches[0].clientY;
        setCurrentY(y);

        // Dynamic update of schedule view while dragging
        if (startY !== null) {
            const diff = startY - y;
            // If pulling up significantly and schedule is hidden, show it
            if (diff > 60 && !showSchedule) {
                setShowSchedule(true);
            }
            // If pulling down significantly and schedule is shown, hide it
            if (diff < -60 && showSchedule && !isExpanded) {
                setShowSchedule(false);
            }
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        if (startY !== null && currentY !== null) {
            const diff = startY - currentY;
            if (Math.abs(diff) > 50) { // Threshold
                if (diff > 0) {
                    setIsExpanded(true); // Swipe Up
                    setShowSchedule(true);
                } else {
                    setIsExpanded(false); // Swipe Down
                    setShowSchedule(false);
                }
            }
        }
        setStartY(null);
        setCurrentY(null);
    };

    const handleDirectionChange = (idx) => {
        setSelectedDirection(idx);
        setSelectedVariant(null); // Reset variant when direction changes
        if (onDirectionSelect && trips[idx]) {
            onDirectionSelect(routeName, trips[idx].headsign);
        }
    };

    const getSheetHeight = () => {
        const screenH = window.innerHeight;
        const minHeight = 230;
        const maxHeight = screenH - 100;

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

                <div className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
                    <div className="grid grid-cols-3 gap-2 px-5 pb-4 pt-1">
                        {times.map((entry, idx) => {
                            const timeStr = typeof entry === 'string' ? entry : entry.time;
                            const variantLabel = typeof entry === 'object' ? entry.variantLabel : null;
                            const variantName = typeof entry === 'object' ? entry.variant : null;
                            const isSelected = selectedTimeStr === timeStr && selectedVariant === variantName;
                            const isDefault = scheduleItems[0]?.calculatedTime === timeStr && !selectedTimeStr;

                            return (
                                <button
                                    key={`${timeStr}-${variantLabel || ''}-${idx}`}
                                    onClick={() => {
                                        setSelectedTimeStr(timeStr);
                                        if (variantName) setSelectedVariant(variantName);
                                    }}
                                    className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-0.5 ${isSelected
                                        ? 'bg-primary text-white shadow-md'
                                        : isDefault
                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-primary dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                            : 'bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    <span>{timeStr}</span>
                                    {variantLabel && (
                                        <span className={`text-[9px] font-medium ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                                            {variantLabel === 'Tuesday Only' || variantLabel === 'Weekday' ? variantLabel : `via ${variantLabel}`}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
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
                <div className="flex items-center justify-end gap-1">
                    <button
                        onClick={() => setShowReportDialog(true)}
                        className="flex size-10 cursor-pointer items-center justify-center rounded-full text-white hover:bg-gray-800 transition-colors"
                        title="Report Issue"
                    >
                        <span className="material-symbols-outlined text-orange-400">report_problem</span>
                    </button>
                </div>
            </header>

            <ReportDialog
                isOpen={showReportDialog}
                onClose={() => setShowReportDialog(false)}
                defaultType="route_fix"
                defaultDetails={`Issue with ${routeName}: `}
            />

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
                    className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1a2632] rounded-t-2xl z-10 flex flex-col shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-[height] ease-out will-change-[height]"
                    style={{
                        height: getSheetHeight(),
                        transitionDuration: isDragging ? '0ms' : '300ms'
                    }}
                >

                    {/* Drag Handle Area */}
                    <div
                        className="relative w-full shrink-0 cursor-grab active:cursor-grabbing touch-none pt-6"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        {/* Visual Pull Bar */}
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>

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
                    </div>

                    {/* Scrollable Content - Schedule + Stops together */}
                    <div className="flex-1 overflow-y-auto pb-20">
                        {/* Schedule Accordions - scrolls with stops */}
                        {/* Keeping it always mounted but hidden for performance */}
                        <div className={`flex-col bg-white dark:bg-[#1a2632] border-b border-gray-800 animate-in fade-in slide-in-from-top-1 duration-200 ${showSchedule ? 'flex' : 'hidden'}`}>
                            {renderAccordion("Morning", groupedTimes.morning, 'morning')}
                            {renderAccordion("Afternoon", groupedTimes.afternoon, 'afternoon')}
                            {renderAccordion("Evening", groupedTimes.evening, 'evening')}
                        </div>

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
