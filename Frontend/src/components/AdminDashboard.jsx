import React, { useState, useEffect } from 'react';
import { fetchReports } from '../services/api';

const AdminDashboard = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        setLoading(true);
        const data = await fetchReports();
        setReports(data || []);
        setLoading(false);
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'new_stop': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-900';
            case 'remove_stop': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-900';
            case 'route_fix': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-900';
            default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'new_stop': return 'New Stop Suggestion';
            case 'remove_stop': return 'Stop Issue';
            case 'route_fix': return 'Route Correction';
            default: return type;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#101922] p-6 lg:p-10 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex size-2 rounded-full bg-green-500"></span>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Community Reports Live View</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => window.location.href = '/'}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1a2633] border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-[#232e3a] transition-colors text-gray-700 dark:text-gray-200"
                        >
                            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                            Back to App
                        </button>
                        <button
                            onClick={loadReports}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm shadow-blue-500/30 transition-colors font-medium"
                        >
                            <span className="material-symbols-outlined text-[20px]">refresh</span>
                            Refresh Data
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-[#1a2633] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Reports</h3>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{reports.length}</p>
                    </div>
                    <div className="bg-white dark:bg-[#1a2633] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stop Issues</h3>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                            {reports.filter(r => r.type === 'remove_stop').length}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-[#1a2633] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">New Stop Requests</h3>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                            {reports.filter(r => r.type === 'new_stop').length}
                        </p>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#1a2633] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-[#232e3a]/50">
                        <h3 className="font-bold text-gray-900 dark:text-white">Recent Reports</h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            Showing {reports.length} entries
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 dark:bg-[#232e3a] border-b border-gray-200 dark:border-gray-800">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">Timestamp</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">Type</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Details</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">IP Address</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {loading ? (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="size-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                                                <p>Loading reports data...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : reports.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-20 text-center text-gray-500 dark:text-gray-400">
                                            <div className="flex flex-col items-center gap-3 opacity-60">
                                                <span className="material-symbols-outlined text-5xl">inbox</span>
                                                <p className="text-lg font-medium">No reports received yet</p>
                                                <p className="text-sm">Reports submitted by users will appear here live.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    reports.map((report) => (
                                        <tr key={report.id} className="group hover:bg-gray-50 dark:hover:bg-[#232e3a]/50 transition-colors">
                                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap font-mono">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-gray-900 dark:text-white">
                                                        {new Date(report.timestamp).toLocaleDateString()}
                                                    </span>
                                                    <span className="text-xs opacity-75">
                                                        {new Date(report.timestamp).toLocaleTimeString()}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 align-top">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${getTypeColor(report.type)}`}>
                                                    {report.type === 'new_stop' && <span className="material-symbols-outlined text-[14px]">add_location_alt</span>}
                                                    {report.type === 'remove_stop' && <span className="material-symbols-outlined text-[14px]">wrong_location</span>}
                                                    {report.type === 'route_fix' && <span className="material-symbols-outlined text-[14px]">alt_route</span>}
                                                    {getTypeLabel(report.type)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-800 dark:text-gray-200">
                                                <p className="whitespace-pre-wrap leading-relaxed max-w-2xl">{report.details}</p>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-mono text-gray-400 dark:text-gray-500 font-mono align-top pt-5">
                                                {report.ip || 'Unknown'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
