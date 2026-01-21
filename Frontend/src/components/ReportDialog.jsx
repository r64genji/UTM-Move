import { useState } from 'react';
import { submitReport } from '../services/api';

const ReportDialog = ({ isOpen, onClose, defaultType = 'new_stop', defaultDetails = '' }) => {
    const [type, setType] = useState(defaultType);
    const [details, setDetails] = useState(defaultDetails);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);
    const [error, setError] = useState(null);

    // Reset details when type changes if it's empty
    const handleTypeChange = (newType) => {
        setType(newType);
        setError(null);
    };

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            await submitReport(type, details);
            setSuccessMessage('Thank you! Your report has been submitted.');
            setTimeout(() => {
                setSuccessMessage(null);
                setDetails('');
                onClose();
            }, 2000);
        } catch (err) {
            setError('Failed to submit report. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#1a2632] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-800">
                {successMessage ? (
                    <div className="p-8 flex flex-col items-center text-center">
                        <div className="size-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-3xl">check</span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Report Sent!</h3>
                        <p className="text-gray-500 dark:text-gray-400">{successMessage}</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col h-full">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-[#232e3a]">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-600">report_problem</span>
                                Report an Issue
                            </h3>
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Issue Type</label>
                                <div className="grid grid-cols-1 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleTypeChange('new_stop')}
                                        className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${type === 'new_stop'
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                            : 'border-transparent bg-gray-100 dark:bg-[#232e3a] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a3847]'}`}
                                    >
                                        <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${type === 'new_stop' ? 'bg-blue-100 dark:bg-blue-800' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                            <span className="material-symbols-outlined text-[18px]">add_location_alt</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm">New Bus Stop</span>
                                            <span className="text-xs opacity-75">Suggest a missing stop location</span>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleTypeChange('remove_stop')}
                                        className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${type === 'remove_stop'
                                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                            : 'border-transparent bg-gray-100 dark:bg-[#232e3a] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a3847]'}`}
                                    >
                                        <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${type === 'remove_stop' ? 'bg-red-100 dark:bg-red-800' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                            <span className="material-symbols-outlined text-[18px]">wrong_location</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm">Stop Issue</span>
                                            <span className="text-xs opacity-75">Stop not in use or incorrect</span>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleTypeChange('route_fix')}
                                        className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${type === 'route_fix'
                                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                                            : 'border-transparent bg-gray-100 dark:bg-[#232e3a] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a3847]'}`}
                                    >
                                        <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${type === 'route_fix' ? 'bg-orange-100 dark:bg-orange-800' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                            <span className="material-symbols-outlined text-[18px]">alt_route</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm">Route Correction</span>
                                            <span className="text-xs opacity-75">Wrong path or timing</span>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Details</label>
                                <textarea
                                    value={details}
                                    onChange={(e) => setDetails(e.target.value)}
                                    placeholder={
                                        type === 'new_stop' ? "Where is the new stop located? (e.g. Near Faculty of Computing)" :
                                            type === 'remove_stop' ? "Which stop needs to be removed and why?" :
                                                "What is wrong with the route? (e.g. Incorrect path near library)"
                                    }
                                    className="w-full h-32 p-3 rounded-xl bg-gray-100 dark:bg-[#232e3a] border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-[#1a2633] outline-none text-sm text-gray-900 dark:text-white transition-all resize-none placeholder-gray-400"
                                    required
                                />
                            </div>

                            {error && (
                                <p className="text-red-500 text-xs font-bold bg-red-50 dark:bg-red-900/20 p-2 rounded flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px]">error</span>
                                    {error}
                                </p>
                            )}
                        </div>

                        <div className="p-5 pt-0 mt-auto">
                            <button
                                type="submit"
                                disabled={isSubmitting || !details.trim()}
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span>Sending...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">send</span>
                                        <span>Submit Report</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ReportDialog;
