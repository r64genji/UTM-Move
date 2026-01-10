import { useState, useEffect } from 'react';

const MobileWelcomePage = ({ onGetStarted, onSkip }) => {
    return (
        <div className="relative flex h-full min-h-screen w-full max-w-md mx-auto flex-col overflow-hidden shadow-2xl bg-background-light dark:bg-background-dark">
            {/* Top Bar */}
            <div className="flex items-center p-4 pt-6 justify-between bg-transparent z-10 absolute top-0 w-full">
                {/* App Logo/Icon */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10 dark:bg-white/5 backdrop-blur-sm border border-primary/20">
                        <span className="material-symbols-outlined text-primary text-[24px]">directions_bus</span>
                    </div>
                </div>
                <button
                    onClick={onSkip}
                    className="flex items-center justify-end px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-colors"
                >
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Skip</p>
                </button>
            </div>

            {/* Hero Section with Image */}
            <div className="relative flex-1 flex flex-col justify-end">
                {/* Background Gradient/Image Container */}
                <div className="absolute inset-0 z-0">
                    {/* Abstract Map Graphic */}
                    <div
                        className="w-full h-full bg-cover bg-center"
                        style={{
                            backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAtbeUD8mYP7MjzWosM3c-98Vk7ZobhKSWdegNz9Fc22sQUWpmHhxGXdGWO4C3RLdlOPuMAhBeUhDMApW6NhFLg6gb2hlrN-kDW7E3IqrFs-z2Nly5nrm3ryyAkQzOo4Dwdk6qhqCcFWBvE1topZuIyqXkx4wVqzbZg7sDxYjlpLwAzRKMlmxv8kIrXfKbgGRhsaUfC0sAG2-78lsF_sO9AQh-GkgeTUX6OosS9IRKROrCUx_oKLG977AMJpDpdolmlglD7MHP0HN0")'
                        }}
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-background-light/30 via-background-light/80 to-background-light dark:from-background-dark/30 dark:via-background-dark/80 dark:to-background-dark"></div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="relative z-10 w-full flex flex-col items-center px-6 pb-8 pt-20">
                    {/* Hero Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-primary/10 border border-primary/20 shadow-glow backdrop-blur-md">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                        <span className="text-xs font-semibold text-primary tracking-wide uppercase">Live Updates</span>
                    </div>

                    {/* Headline */}
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center leading-[1.15] mb-4 text-slate-900 dark:text-white drop-shadow-sm">
                        Never Miss <br />the <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">Bus</span> Again
                    </h1>

                    {/* Body Text */}
                    <p className="text-slate-600 dark:text-slate-400 text-base font-medium leading-relaxed text-center max-w-[320px] mb-8">
                        Track real-time locations, view detailed campus routes, and ensure you get to class on time.
                    </p>

                    {/* Feature Carousel / Cards */}
                    <div className="w-full mb-8">
                        <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-6 px-6 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                            {/* Card 1 */}
                            <div className="snap-center shrink-0 w-64 p-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 shadow-lg flex flex-col gap-3">
                                <div className="size-10 rounded-full bg-blue-100 dark:bg-primary/20 flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined">share_location</span>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Real-time Tracking</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">See exactly where your bus is on the live map.</p>
                                </div>
                            </div>
                            {/* Card 2 */}
                            <div className="snap-center shrink-0 w-64 p-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 shadow-lg flex flex-col gap-3">
                                <div className="size-10 rounded-full bg-blue-100 dark:bg-primary/20 flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined">schedule</span>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Accurate ETAs</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Know exactly when to head to the bus stop.</p>
                                </div>
                            </div>
                            {/* Card 3 */}
                            <div className="snap-center shrink-0 w-64 p-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 shadow-lg flex flex-col gap-3">
                                <div className="size-10 rounded-full bg-blue-100 dark:bg-primary/20 flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined">notifications_active</span>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Live Alerts</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Get instant updates on route changes and delays.</p>
                                </div>
                            </div>
                        </div>

                        {/* Page Indicators */}
                        <div className="flex w-full flex-row items-center justify-center gap-2 mt-2">
                            <div className="h-1.5 w-6 rounded-full bg-primary"></div>
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="w-full space-y-3">
                        <button
                            onClick={onGetStarted}
                            className="w-full bg-primary hover:bg-blue-600 active:bg-blue-700 text-white font-bold h-14 rounded-2xl text-lg shadow-lg shadow-primary/30 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            <span>Start Navigating</span>
                            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                        </button>
                        <button className="w-full bg-transparent text-slate-600 dark:text-slate-400 font-semibold h-12 rounded-2xl text-sm hover:text-primary dark:hover:text-primary transition-colors flex items-center justify-center">
                            Log In with Student ID
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MobileWelcomePage;
