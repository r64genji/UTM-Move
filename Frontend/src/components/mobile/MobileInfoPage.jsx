import React from 'react';
import BottomNavigation from './BottomNavigation';

const MobileInfoPage = ({ activeTab, onTabChange }) => {
    return (
        <div className="relative flex h-full min-h-screen w-full max-w-md mx-auto flex-col overflow-x-hidden bg-[#101922] shadow-xl">
            {/* Header */}
            <div className="flex items-center px-4 py-4 justify-between sticky top-0 bg-[#101922] z-20 border-b border-gray-800">
                <button
                    onClick={() => onTabChange('routes')}
                    className="flex size-10 items-center justify-center rounded-full hover:bg-gray-800 text-white transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h2 className="text-lg font-bold text-white">Disclaimer</h2>
                <div className="w-10"></div> {/* Spacer */}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pb-24 px-6 pt-10">
                <div className="space-y-8">
                    {/* Main Disclaimer Card */}
                    <section>
                        <div className="bg-amber-500/5 rounded-2xl p-6 border border-amber-500/20 shadow-lg">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="size-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                                    <span className="material-symbols-outlined text-[24px]">warning</span>
                                </div>
                                <h4 className="text-amber-500 text-sm font-black uppercase tracking-widest">Important Notice</h4>
                            </div>

                            <h3 className="text-white text-xl font-bold mb-4 leading-tight">Arrival Time Accuracy</h3>

                            <p className="text-gray-300 text-sm leading-relaxed mb-6">
                                Please be advised that bus arrival times provided in this application are <span className="text-white font-bold underline decoration-amber-500/50">estimates only</span>. While we strive for precision, real-time data may not always reflect exact circumstances.
                            </p>

                            <div className="space-y-4">
                                <p className="text-gray-400 text-[13px] font-medium italic underline underline-offset-4 decoration-gray-700">Actual times may vary due to:</p>
                                <ul className="space-y-3">
                                    {[
                                        'Traffic congestion within and around campus',
                                        'Variable passenger boarding and alighting times',
                                        'Occasional bus maintenance or driver rotation',
                                        'Unscheduled service interruptions or breaks'
                                    ].map((item, i) => (
                                        <li key={i} className="flex items-start gap-3 text-gray-400 text-[13px]">
                                            <span className="size-1.5 rounded-full bg-amber-500/40 mt-1.5 shrink-0"></span>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/5">
                                <p className="text-gray-300 text-xs leading-relaxed text-center font-medium">
                                    To ensure you don't miss your ride, we highly recommend arriving at the bus stop
                                    <span className="text-amber-400 font-bold"> 5 minutes before </span>
                                    the scheduled arrival time.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Footer Info */}
                    <section className="space-y-4">
                        <div className="bg-[#1a2633] rounded-2xl p-4 border border-gray-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-gray-500 text-[20px]">calendar_today</span>
                                <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Route Last Updated</span>
                            </div>
                            <span className="text-blue-400 text-xs font-black px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                                JAN 10, 2026
                            </span>
                        </div>

                        <p className="text-center text-gray-600 text-[10px] leading-relaxed px-4">
                            Schedules are based on the latest data provided by UTM Transport Services.
                            Application maintained by the UTM Move Development Team.
                        </p>
                    </section>
                </div>
            </div>

            {/* Bottom Navigation */}
            <BottomNavigation activeTab={activeTab} onTabChange={onTabChange} />
        </div>
    );
};

export default MobileInfoPage;
