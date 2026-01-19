import { useState, useEffect } from 'react';

const BottomNavigation = ({ activeTab, onTabChange }) => {
    const tabs = [
        { id: 'home', icon: 'home', label: 'Home' },
        { id: 'routes', icon: 'alt_route', label: 'Routes' },
        { id: 'navigate', icon: 'navigation', label: 'Navigate' },
        { id: 'profile', icon: 'volunteer_activism', label: 'Contribute' },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#101922] border-t border-gray-200 dark:border-gray-800 z-50 pb-safe">
            <div className="grid grid-cols-4 h-16 items-center">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`flex flex-col items-center justify-center gap-1 w-full h-full ${activeTab === tab.id
                            ? 'text-primary'
                            : 'text-gray-400 dark:text-gray-500 active:text-primary'
                            }`}
                    >
                        <span
                            className="material-symbols-outlined text-2xl"
                            style={activeTab === tab.id ? { fontVariationSettings: "'FILL' 1" } : {}}
                        >
                            {tab.icon}
                        </span>
                        <span className={`text-[10px] ${activeTab === tab.id ? 'font-bold' : 'font-medium'}`}>
                            {tab.label}
                        </span>
                    </button>
                ))}
            </div>
            {/* Safe area spacer for iOS home indicator */}
            <div className="h-[env(safe-area-inset-bottom)] w-full bg-[#101922]"></div>
        </div>
    );
};

export default BottomNavigation;
