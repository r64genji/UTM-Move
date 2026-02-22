import BottomNavigation from './BottomNavigation';

const MobileContributePage = ({ activeTab, onTabChange }) => {
    const handleOpenLink = (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="bg-[#101922] font-display text-white transition-colors duration-200 min-h-screen">
            <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden pb-24">
                {/* Top App Bar */}
                <div className="sticky top-0 z-10 flex items-center bg-[#101922] p-4 border-b border-gray-800 transition-colors duration-200">
                    <h2 className="text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">Contribute</h2>
                </div>

                {/* Scrollable Content */}
                <main className="flex flex-col gap-6 px-4 pt-6">
                    {/* Header Section */}
                    <div className="flex flex-col items-center gap-3 text-center py-8 bg-[#1a2633] rounded-[32px] mx-1 border border-gray-800 shadow-sm relative overflow-hidden">

                        <div className="relative mt-2">
                            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-500/20 transform rotate-3">
                                <span className="material-symbols-outlined text-white text-4xl transform -rotate-3">volunteer_activism</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#101922] shadow-md border border-gray-800">
                                <span className="material-symbols-outlined text-red-500 text-[14px] font-bold">favorite</span>
                            </div>
                        </div>
                        <div className="mt-2 px-6">
                            <h1 className="text-2xl font-black tracking-tight text-white leading-tight">Help Improve UTM Move</h1>
                            <p className="text-[15px] font-medium text-[#617589] dark:text-gray-400 mt-2 max-w-[280px] mx-auto leading-relaxed">Your contributions make this app better for everyone in the campus</p>
                        </div>
                    </div>

                    {/* Report & Suggest Section */}
                    <section>
                        <h3 className="text-sm font-bold text-[#617589] dark:text-gray-400 uppercase tracking-widest px-1 mb-3">Report & Suggest</h3>
                        <div className="bg-[#1a2633] rounded-2xl overflow-hidden border border-gray-800 shadow-sm">
                            {/* Report a Bug */}
                            <div
                                onClick={() => handleOpenLink('https://docs.google.com/forms/d/e/1FAIpQLSfwLOnLvRxB2sJnAHIDMqcKtaVTYy8OR3KrJ_beSJKOIYxj0Q/viewform')}
                                className="flex items-center gap-4 px-5 py-5 hover:bg-gray-800/50 transition-colors cursor-pointer border-b border-gray-800"
                            >
                                <div className="size-11 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-red-500">bug_report</span>
                                </div>
                                <div className="flex flex-1 flex-col justify-center">
                                    <p className="text-base font-medium leading-normal text-white">Report a Bug</p>
                                    <p className="text-xs text-[#617589] dark:text-gray-400">Found something broken? Let us know</p>
                                </div>
                                <span className="material-symbols-outlined text-[#617589] dark:text-gray-500">open_in_new</span>
                            </div>
                            {/* Suggest a Feature */}
                            <div
                                onClick={() => handleOpenLink('https://docs.google.com/forms/d/e/1FAIpQLSdCnuw2A3BepSKT5rwRmE6ScBmIbJhtj2sQ67v9Nzih_DOHmw/viewform')}
                                className="flex items-center gap-4 px-5 py-5 hover:bg-gray-800/50 transition-colors cursor-pointer"
                            >
                                <div className="size-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-emerald-500">lightbulb</span>
                                </div>
                                <div className="flex flex-1 flex-col justify-center">
                                    <p className="text-base font-medium leading-normal text-white">Send Feedback</p>
                                    <p className="text-xs text-[#617589] dark:text-gray-400">Share ideas, suggestions, or general feedback</p>
                                </div>
                                <span className="material-symbols-outlined text-[#617589] dark:text-gray-500">open_in_new</span>
                            </div>
                        </div>
                    </section>

                    {/* Contribute to Map Section */}
                    <section>
                        <h3 className="text-sm font-bold text-[#617589] dark:text-gray-400 uppercase tracking-widest px-1 mb-3">Contribute to Map</h3>
                        <div className="bg-[#1a2633] rounded-2xl overflow-hidden border border-gray-800 shadow-sm">
                            <div
                                onClick={() => handleOpenLink('https://www.openstreetmap.org/edit#map=16/1.56063/103.64036')}
                                className="flex items-center gap-4 px-5 py-5 hover:bg-gray-800/50 transition-colors cursor-pointer"
                            >
                                <div className="size-11 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-orange-500">map</span>
                                </div>
                                <div className="flex flex-1 flex-col justify-center">
                                    <p className="text-base font-medium leading-normal text-white">Edit on OpenStreetMap</p>
                                    <p className="text-xs text-[#617589] dark:text-gray-400">Help improve campus map data</p>
                                </div>
                                <span className="material-symbols-outlined text-[#617589] dark:text-gray-500">open_in_new</span>
                            </div>
                        </div>
                    </section>

                    {/* About Section */}
                    <section>
                        <h3 className="text-sm font-bold text-[#617589] dark:text-gray-400 uppercase tracking-widest px-1 mb-3">About</h3>
                        <div className="bg-[#1a2633] rounded-2xl overflow-hidden border border-gray-800 shadow-sm">
                            <div
                                onClick={() => handleOpenLink('https://github.com/r64genji/UTM-Move')}
                                className="flex items-center gap-4 px-5 py-5 hover:bg-gray-800/50 transition-colors cursor-pointer border-b border-gray-800"
                            >
                                <div className="size-11 rounded-xl bg-gray-500/10 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">code</span>
                                </div>
                                <div className="flex flex-1 flex-col justify-center">
                                    <p className="text-base font-medium leading-normal text-white">View on GitHub</p>
                                    <p className="text-xs text-[#617589] dark:text-gray-400">Check out the source code</p>
                                </div>
                                <span className="material-symbols-outlined text-[#617589] dark:text-gray-500">open_in_new</span>
                            </div>
                            {/* Contact */}
                            <div
                                onClick={() => handleOpenLink('mailto:tabe259@yahoo.com')}
                                className="flex items-center gap-4 px-5 py-5 hover:bg-gray-800/50 transition-colors cursor-pointer"
                            >
                                <div className="size-11 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-blue-500">mail</span>
                                </div>
                                <div className="flex flex-1 flex-col justify-center">
                                    <p className="text-base font-medium leading-normal text-white">Contact Developer</p>
                                    <p className="text-xs text-[#617589] dark:text-gray-400">Send an email directly</p>
                                </div>
                                <span className="material-symbols-outlined text-[#617589] dark:text-gray-500">open_in_new</span>
                            </div>
                        </div>
                    </section>

                    {/* Footer */}
                    <div className="mt-2 mb-6 flex flex-col items-center gap-2">
                        <p className="text-xs text-[#617589] dark:text-gray-500">Made with ❤️, for UTM students</p>
                        <p className="text-xs text-[#617589] dark:text-gray-500">App Version 1.0.1</p>
                    </div>
                </main>

                {/* Bottom Navigation */}
                <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
            </div>
        </div>
    );
};

export default MobileContributePage;
