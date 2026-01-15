import { useState, useEffect } from 'react';
import BottomNavigation from './BottomNavigation';
import { fetchNextBus } from '../../services/api';
import { getRouteColor } from '../../constants';

const MobileRoutesPage = ({ activeTab, onTabChange, routes, onSelectRoute }) => {
    const [selectedService, setSelectedService] = useState('WEEKDAY');
    const [nextBusData, setNextBusData] = useState({});

    useEffect(() => {
        if (!routes || routes.length === 0) return;

        const loadNextBuses = async () => {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

            const newData = {};
            for (const route of routes) {
                try {
                    const result = await fetchNextBus(route.name, timeStr);
                    if (result && result.next_trip) {
                        newData[route.name] = result;
                    }
                } catch (e) {
                    console.error('Failed to fetch next bus for', route.name);
                }
            }
            setNextBusData(newData);
        };

        loadNextBuses();
        const interval = setInterval(loadNextBuses, 60000); // Update every minute
        return () => clearInterval(interval);
    }, [routes]);

    return (
        <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-[#101922] shadow-xl">
            {/* Header */}
            <div className="flex items-center px-4 py-3 justify-between sticky top-0 bg-[#101922] z-20 border-b border-gray-800">
                <div className="size-10"></div> {/* Left spacer since menu is removed */}
                <div className="flex flex-col items-center">
                    <h2 className="text-lg font-bold text-white leading-tight tracking-tight">All Routes</h2>
                </div>
                <button
                    onClick={() => onTabChange('info')}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-800 cursor-pointer text-white transition-colors"
                >
                    <span className="material-symbols-outlined">info</span>
                </button>
            </div>

            {/* Service Type Tabs */}
            <div className="px-4 py-2 bg-[#101922]">
                <div className="flex h-10 w-full items-center justify-center rounded-lg bg-[#f0f2f4] dark:bg-[#1a2633] p-1">
                    <label
                        className={`flex cursor-pointer h-full flex-1 items-center justify-center overflow-hidden rounded-md text-sm font-bold transition-all ${selectedService === 'WEEKDAY'
                            ? 'bg-white dark:bg-[#2a3847] shadow-sm text-primary dark:text-blue-400'
                            : 'text-[#617589] dark:text-gray-400 hover:text-[#111418] dark:hover:text-gray-200'
                            }`}
                        onClick={() => setSelectedService('WEEKDAY')}
                    >
                        <span className="truncate">Weekday</span>
                    </label>
                    <label
                        className={`flex cursor-pointer h-full flex-1 items-center justify-center overflow-hidden rounded-md text-sm font-bold transition-all ${selectedService === 'WEEKEND'
                            ? 'bg-white dark:bg-[#2a3847] shadow-sm text-primary dark:text-blue-400'
                            : 'text-[#617589] dark:text-gray-400 hover:text-[#111418] dark:hover:text-gray-200'
                            }`}
                        onClick={() => setSelectedService('WEEKEND')}
                    >
                        <span className="truncate">Weekend</span>
                    </label>
                </div>
            </div>

            {/* Routes List */}
            <div className="flex-1 overflow-y-auto bg-[#101922] pb-24">
                <div className="px-4 py-4 space-y-3">
                    {routes && routes.length > 0 ? (
                        routes
                            .filter(route => route.services?.some(s => s.service_id === selectedService))
                            .map((route) => {
                                const color = getRouteColor(route.name);
                                const activeService = route.services?.find(s => s.service_id === selectedService);
                                const routeInfo = nextBusData[route.name];
                                const nextTime = routeInfo?.next_trip?.time;
                                const headsign = routeInfo?.next_trip?.headsign || activeService?.trips?.[0]?.headsign || 'View Schedule';

                                // Calculate Status
                                const now = new Date();
                                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                                const currentDay = days[now.getDay()];
                                const isServiceDay = activeService?.days?.includes(currentDay);

                                let statusText = 'Inactive';
                                let statusColor = 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'; // Default Inactive

                                if (isServiceDay) {
                                    const currentHours = now.getHours();
                                    const currentMinutes = now.getMinutes();
                                    const currentTotalMins = currentHours * 60 + currentMinutes;
                                    const currentTimeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
                                    const isFridayPrayer = currentDay === 'friday' && currentTotalMins >= 760 && currentTotalMins < 840;

                                    // Find the earliest and latest bus times for this service
                                    let earliestTime = '23:59';
                                    let latestTime = '00:00';

                                    activeService?.trips?.forEach(trip => {
                                        trip.times?.forEach(time => {
                                            if (time && time < earliestTime) earliestTime = time;
                                            if (time && time > latestTime) latestTime = time;
                                        });
                                    });

                                    // Check if current time is within service hours
                                    const isBeforeServiceStart = currentTimeStr < earliestTime;
                                    const isAfterServiceEnd = currentTimeStr > latestTime;

                                    // Check how many headsigns have remaining trips
                                    let activeHeadsigns = 0;
                                    let totalHeadsigns = activeService?.trips?.length || 0;

                                    activeService?.trips?.forEach(trip => {
                                        const hasRemainingTrips = trip.times?.some(time => time > currentTimeStr);
                                        if (hasRemainingTrips) activeHeadsigns++;
                                    });

                                    if (isFridayPrayer) {
                                        statusText = 'Prayer Break';
                                        statusColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200';
                                    } else if (isBeforeServiceStart) {
                                        // Before first bus - check if starting within an hour
                                        const earlyParts = earliestTime.split(':').map(Number);
                                        const earlyTotalMins = earlyParts[0] * 60 + earlyParts[1];
                                        const minsUntilStart = earlyTotalMins - currentTotalMins;

                                        if (minsUntilStart <= 60 && minsUntilStart > 0) {
                                            statusText = 'Starting Soon';
                                            statusColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200';
                                        } else {
                                            statusText = 'Inactive';
                                            statusColor = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
                                        }
                                    } else if (isAfterServiceEnd) {
                                        statusText = 'Service Ended';
                                        statusColor = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
                                    } else if (activeHeadsigns === totalHeadsigns && totalHeadsigns > 0) {
                                        // All headsigns have remaining trips
                                        statusText = 'Active';
                                        statusColor = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                                    } else if (activeHeadsigns > 0) {
                                        // Some headsigns have remaining trips
                                        statusText = 'Limited';
                                        statusColor = 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200';
                                    } else {
                                        // No remaining trips
                                        statusText = 'Service Ended';
                                        statusColor = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
                                    }
                                } else {
                                    statusText = 'Not Today';
                                    statusColor = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200';
                                }

                                // Format Display Name
                                let displayName = route.name;
                                if (selectedService === 'WEEKEND' && route.name === 'Route E(N24)') {
                                    displayName = 'Route E';
                                }

                                return (
                                    <div
                                        key={route.name}
                                        onClick={() => onSelectRoute && onSelectRoute(route, selectedService)}
                                        className="bg-[#1a2633] rounded-xl shadow-sm p-4 border border-gray-800 cursor-pointer hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                                                style={{ backgroundColor: `${color}20` }}
                                            >
                                                <span
                                                    className="material-symbols-outlined text-2xl"
                                                    style={{ color }}
                                                >
                                                    directions_bus
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-white text-base font-bold truncate">
                                                            {displayName}
                                                        </h3>
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}>
                                                            {statusText}
                                                        </span>
                                                    </div>
                                                    {nextTime && (
                                                        <span
                                                            className="text-xs font-black px-2 py-1 rounded shadow-sm"
                                                            style={{
                                                                backgroundColor: `${color}15`,
                                                                color: color,
                                                                border: `1px solid ${color}30`
                                                            }}
                                                        >
                                                            {nextTime}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[#617589] dark:text-gray-400 text-sm truncate">
                                                    {headsign}
                                                </p>
                                            </div>
                                            <span className="material-symbols-outlined text-gray-400 dark:text-gray-500">
                                                chevron_right
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                    ) : (
                        // Placeholder routes
                        ['Route A', 'Route B', 'Route C', 'Route D', 'Route E', 'Route F', 'Route G', 'Route L'].map((name, idx) => {
                            const color = getRouteColor(name);
                            return (
                                <div
                                    key={name}
                                    onClick={() => onSelectRoute && onSelectRoute({ name, services: [] })}
                                    className="bg-[#1a2633] rounded-xl shadow-sm p-4 border border-gray-800 cursor-pointer hover:shadow-md transition-shadow"
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ backgroundColor: `${color}20` }}
                                        >
                                            <span className="material-symbols-outlined text-2xl" style={{ color }}>
                                                directions_bus
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-white text-base font-bold truncate">
                                                    {name}
                                                </h3>
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                                    Active
                                                </span>
                                            </div>
                                            <p className="text-[#617589] dark:text-gray-400 text-sm truncate">
                                                View Schedule
                                            </p>
                                        </div>
                                        <span className="material-symbols-outlined text-gray-400 dark:text-gray-500">
                                            chevron_right
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Bottom Navigation */}
            <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
        </div>
    );
};

export default MobileRoutesPage;
