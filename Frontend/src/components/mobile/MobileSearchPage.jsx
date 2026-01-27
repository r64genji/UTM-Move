import { useState, useEffect, useMemo } from 'react';
import BottomNavigation from './BottomNavigation';

// localStorage keys
const FAVOURITES_KEY = 'utmove_favourites';
const RECENT_KEY = 'utmove_recent';

const MobileSearchPage = ({ activeTab, onTabChange, onBack, locations, stops, onSelectLocation, searchType, onPinOnMap }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState(null); // null = show default, or 'food', 'faculty', 'residential', 'favourites'
    const [favourites, setFavourites] = useState([]);
    const [recentLocations, setRecentLocations] = useState([]);

    // Load favourites and recent from localStorage
    useEffect(() => {
        const savedFavourites = localStorage.getItem(FAVOURITES_KEY);
        if (savedFavourites) {
            setFavourites(JSON.parse(savedFavourites));
        }
        const savedRecent = localStorage.getItem(RECENT_KEY);
        if (savedRecent) {
            setRecentLocations(JSON.parse(savedRecent));
        }
    }, []);

    // Save to recent when selecting a location
    const handleSelectLocation = (location) => {
        if (location) {
            // Add to recent (max 5, no duplicates)
            const updated = [location, ...recentLocations.filter(l => l.id !== location.id)].slice(0, 5);
            setRecentLocations(updated);
            localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
        }
        onSelectLocation && onSelectLocation(location);
    };

    // Toggle favourite
    const toggleFavourite = (e, location) => {
        e.stopPropagation();
        const isFav = favourites.some(f => f.id === location.id);
        let updated;
        if (isFav) {
            updated = favourites.filter(f => f.id !== location.id);
        } else {
            updated = [...favourites, location];
        }
        setFavourites(updated);
        localStorage.setItem(FAVOURITES_KEY, JSON.stringify(updated));
    };

    const isFavourite = (locationId) => favourites.some(f => f.id === locationId);

    // Category definitions (removed favourites - shown directly on page)
    const categories = [
        { id: 'food', label: 'Food', icon: 'restaurant', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400', filter: 'dining' },
        { id: 'faculty', label: 'Faculty', icon: 'school', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', filter: 'academic' },
        { id: 'residential', label: 'Kolej', icon: 'apartment', color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400', filter: 'residential' },
    ];

    // Filtered locations based on search or category
    const filteredLocations = useMemo(() => {
        let result = locations || [];

        // If searching, filter by query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(l =>
                l.name.toLowerCase().includes(query) ||
                (l.keywords && l.keywords.some(k => k.toLowerCase().includes(query)))
            );
            return result.slice(0, 15);
        }

        // If category selected
        if (activeCategory) {
            const cat = categories.find(c => c.id === activeCategory);
            if (cat && cat.filter) {
                result = result.filter(l => l.category === cat.filter);
            }
            return result.slice(0, 20);
        }

        return [];
    }, [searchQuery, locations, activeCategory, favourites]);

    // Get icon for category
    const getCategoryIcon = (category) => {
        switch (category) {
            case 'dining': return 'restaurant';
            case 'academic': return 'school';
            case 'residential': return 'apartment';
            case 'facility': return 'fitness_center';
            default: return 'location_on';
        }
    };

    const getCategoryColor = (category) => {
        switch (category) {
            case 'dining': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
            case 'academic': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
            case 'residential': return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
            case 'facility': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400';
            default: return 'bg-gray-800 text-gray-600 dark:text-gray-400';
        }
    };

    return (
        <div className="bg-[#101922] font-display text-white h-full min-h-screen flex flex-col overflow-x-hidden w-full transition-colors duration-200">
            {/* Top App Bar */}
            <header className="sticky top-0 z-50 bg-[#101922] border-b border-gray-800 transition-colors duration-200">
                <div className="flex items-center px-4 py-3 justify-between">
                    <button
                        onClick={onBack}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-800 transition-colors"
                    >
                        <span className="material-symbols-outlined text-white">arrow_back</span>
                    </button>
                    <h2 className="text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">
                        {searchType === 'origin' ? 'Select Start Location' : 'Select Destination'}
                    </h2>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full px-4 pb-24 pt-4">
                {/* Search Bar */}
                <div className="mb-5">
                    <label className="flex flex-col h-12 w-full">
                        <div className="flex w-full flex-1 items-stretch rounded-xl h-full shadow-sm border border-gray-800">
                            <div className="flex border-none bg-[#1a2633] items-center justify-center pl-4 rounded-l-xl border-r-0">
                                <span className="material-symbols-outlined text-[#617589] dark:text-gray-400">search</span>
                            </div>
                            <input
                                className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl rounded-l-none text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border-none bg-[#1a2633] focus:border-none h-full placeholder:text-[#617589] dark:placeholder:text-gray-400 px-4 pl-2 text-base font-normal leading-normal"
                                placeholder="Search location..."
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setActiveCategory(null);
                                }}
                                autoFocus
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="flex items-center justify-center pr-4 bg-[#1a2633] rounded-r-xl"
                                >
                                    <span className="material-symbols-outlined text-gray-400 text-xl">close</span>
                                </button>
                            )}
                        </div>
                    </label>
                </div>

                {/* Use Current Location (for origin only) */}
                {searchType === 'origin' && !searchQuery && !activeCategory && (
                    <button
                        onClick={() => handleSelectLocation(null)}
                        className="w-full flex items-center gap-4 px-4 py-4 mb-3 bg-[#1a2633] rounded-xl shadow-sm border border-gray-800 hover:bg-gray-800/50 transition-colors group"
                    >
                        <div className="flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 size-10 group-hover:bg-primary group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined">my_location</span>
                        </div>
                        <div className="flex flex-col items-start flex-1 text-left">
                            <p className="text-white text-base font-semibold leading-tight">Use Current Location</p>
                            <p className="text-[#617589] dark:text-gray-400 text-sm mt-0.5">Your GPS location</p>
                        </div>
                        <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                    </button>
                )}

                {/* Pin on Map option */}
                {!searchQuery && !activeCategory && (
                    <button
                        onClick={() => onPinOnMap && onPinOnMap(searchType)}
                        className="w-full flex items-center gap-4 px-4 py-4 mb-5 bg-[#1a2633] rounded-xl shadow-sm border border-gray-800 hover:bg-gray-800/50 transition-colors group"
                    >
                        <div className={`flex items-center justify-center rounded-lg shrink-0 size-10 transition-colors ${searchType === 'origin'
                            ? 'bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white'
                            : 'bg-red-500/10 text-red-500 group-hover:bg-red-500 group-hover:text-white'
                            }`}>
                            <span className="material-symbols-outlined">push_pin</span>
                        </div>
                        <div className="flex flex-col items-start flex-1 text-left">
                            <p className="text-white text-base font-semibold leading-tight">Pin on Map</p>
                            <p className="text-[#617589] dark:text-gray-400 text-sm mt-0.5">
                                {searchType === 'origin' ? 'Tap map to set start' : 'Tap map to set destination'}
                            </p>
                        </div>
                        <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                    </button>
                )}

                {/* Category Icons */}
                {!searchQuery && !activeCategory && (
                    <>
                        <h3 className="text-sm font-bold text-[#617589] dark:text-gray-400 uppercase tracking-widest px-1 mb-3">
                            Browse by Category
                        </h3>
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCategory(cat.id)}
                                    className="flex flex-col items-center gap-2 p-3 bg-[#1a2633] rounded-xl shadow-sm border border-gray-800 hover:ring-2 ring-primary/20 transition-all"
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${cat.color}`}>
                                        <span className="material-symbols-outlined text-2xl">{cat.icon}</span>
                                    </div>
                                    <span className="text-xs font-semibold text-white">{cat.label}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Favourites - Always visible */}
                {!searchQuery && !activeCategory && favourites.length > 0 && (
                    <>
                        <h3 className="text-sm font-bold text-[#617589] dark:text-gray-400 uppercase tracking-widest px-1 mb-3 flex items-center gap-2">
                            <span className="material-symbols-outlined text-red-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
                            Favourites
                        </h3>
                        <div className="bg-[#1a2633] rounded-xl shadow-sm overflow-hidden mb-6 border border-gray-800">
                            {favourites.slice(0, 5).map((location, idx) => (
                                <div
                                    key={location.id}
                                    onClick={() => handleSelectLocation(location)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSelectLocation(location)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors cursor-pointer ${idx < Math.min(favourites.length, 5) - 1 ? 'border-b border-gray-800' : ''}`}
                                >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${getCategoryColor(location.category)}`}>
                                        <span className="material-symbols-outlined text-lg">{getCategoryIcon(location.category)}</span>
                                    </div>
                                    <div className="flex-1 text-left truncate">
                                        <p className="text-white text-sm font-medium truncate">{location.name}</p>
                                    </div>
                                    <button
                                        onClick={(e) => toggleFavourite(e, location)}
                                        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg text-red-500" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Recent Locations */}
                {!searchQuery && !activeCategory && recentLocations.length > 0 && (
                    <>
                        <h3 className="text-sm font-bold text-[#617589] dark:text-gray-400 uppercase tracking-widest px-1 mb-3 flex items-center gap-2">
                            <span className="material-symbols-outlined text-gray-400 text-base">history</span>
                            Recently Viewed
                        </h3>
                        <div className="bg-[#1a2633] rounded-xl shadow-sm overflow-hidden mb-6 border border-gray-800">
                            {recentLocations.map((location, idx) => (
                                <div
                                    key={location.id}
                                    onClick={() => handleSelectLocation(location)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSelectLocation(location)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors cursor-pointer ${idx < recentLocations.length - 1 ? 'border-b border-gray-800' : ''}`}
                                >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${getCategoryColor(location.category)}`}>
                                        <span className="material-symbols-outlined text-lg">{getCategoryIcon(location.category)}</span>
                                    </div>
                                    <div className="flex-1 text-left truncate">
                                        <p className="text-white text-sm font-medium truncate">{location.name}</p>
                                    </div>
                                    <button
                                        onClick={(e) => toggleFavourite(e, location)}
                                        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <span className={`material-symbols-outlined text-lg ${isFavourite(location.id) ? 'text-red-500' : 'text-gray-300 dark:text-gray-600'}`}
                                            style={{ fontVariationSettings: isFavourite(location.id) ? "'FILL' 1" : "'FILL' 0" }}
                                        >favorite</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Category Header with Back */}
                {activeCategory && !searchQuery && (
                    <div className="flex items-center gap-2 mb-3">
                        <button
                            onClick={() => setActiveCategory(null)}
                            className="flex items-center justify-center size-8 rounded-full hover:bg-gray-800 transition-colors"
                        >
                            <span className="material-symbols-outlined text-lg text-gray-500">arrow_back</span>
                        </button>
                        <h3 className="text-sm font-bold text-[#617589] dark:text-gray-400 uppercase tracking-widest">
                            {categories.find(c => c.id === activeCategory)?.label || 'Results'}
                        </h3>
                        <span className="text-xs text-gray-400 ml-auto">{filteredLocations.length} locations</span>
                    </div>
                )}

                {/* Search Results Header */}
                {searchQuery && (
                    <h3 className="text-sm font-bold text-[#617589] dark:text-gray-400 uppercase tracking-widest px-1 mb-3">
                        Search Results ({filteredLocations.length})
                    </h3>
                )}

                {/* Locations List */}
                {(searchQuery || activeCategory) && (
                    <div className="bg-[#1a2633] rounded-xl shadow-sm overflow-hidden mb-6 border border-gray-800">
                        {filteredLocations.length === 0 ? (
                            <div className="p-8 text-center">
                                <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600 mb-2">search_off</span>
                                <p className="text-gray-500 dark:text-gray-400">
                                    {activeCategory === 'favourites' ? 'No favourites yet. Tap the heart to add!' : 'No locations found'}
                                </p>
                            </div>
                        ) : (
                            filteredLocations.map((location, idx) => (
                                <div
                                    key={location.id}
                                    onClick={() => handleSelectLocation(location)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSelectLocation(location)}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-800/50 transition-colors cursor-pointer ${idx < filteredLocations.length - 1 ? 'border-b border-gray-800' : ''}`}
                                >
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${getCategoryColor(location.category)}`}>
                                        <span className="material-symbols-outlined text-xl">{getCategoryIcon(location.category)}</span>
                                    </div>
                                    <div className="flex flex-col items-start flex-1 text-left truncate">
                                        <p className="text-white text-base font-medium leading-normal truncate w-full">
                                            {location.name}
                                        </p>
                                        <p className="text-[#617589] dark:text-gray-400 text-xs truncate w-full">
                                            Near {location.nearestStop || 'UTM'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => toggleFavourite(e, location)}
                                        className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <span className={`material-symbols-outlined text-xl ${isFavourite(location.id) ? 'text-red-500 fill-red-500' : 'text-gray-300 dark:text-gray-600'}`}
                                            style={{ fontVariationSettings: isFavourite(location.id) ? "'FILL' 1" : "'FILL' 0" }}
                                        >
                                            favorite
                                        </span>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </main>

            {/* Bottom Navigation */}
            <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
        </div>
    );
};

export default MobileSearchPage;
