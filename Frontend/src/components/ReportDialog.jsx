const REPORT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd4-41iwX8i8mylExc3UMTn2rGsiKiGsbhXDGCxdtgKhrb5Kg/viewform?usp=publish-editor';

const ReportDialog = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const handleOpenForm = () => {
        window.open(REPORT_FORM_URL, '_blank', 'noopener,noreferrer');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#1a2632] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-800">
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

                <div className="p-6 flex flex-col items-center text-center gap-4">
                    <div className="size-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-3xl">open_in_new</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900 dark:text-white mb-1">Submit via Google Form</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Report missing stops, incorrect routes, or any other issues using our feedback form.
                        </p>
                    </div>
                    <button
                        onClick={handleOpenForm}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined">open_in_new</span>
                        <span>Open Feedback Form</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReportDialog;
