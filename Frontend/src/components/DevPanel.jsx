import React, { useState } from 'react';

/**
 * DevPanel - Developer-only panel for testing with custom time/day
 * Toggle with keyboard shortcut: Ctrl+Shift+D
 */
const DevPanel = ({ devSettings, onSettingsChange }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Toggle panel with Ctrl+Shift+D
    React.useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!isOpen) {
        return (
            <div
                style={{
                    position: 'fixed',
                    bottom: 80,
                    right: 10,
                    zIndex: 9999,
                    background: '#1a1a2e',
                    color: '#0f0',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    cursor: 'pointer',
                    opacity: devSettings.enabled ? 1 : 0.3
                }}
                onClick={() => setIsOpen(true)}
                title="Dev Panel (Ctrl+Shift+D)"
            >
                🛠️ DEV
            </div>
        );
    }

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    return (
        <div style={{
            position: 'fixed',
            bottom: 80,
            right: 10,
            zIndex: 9999,
            background: '#1a1a2e',
            color: '#fff',
            padding: 16,
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            minWidth: 280,
            fontFamily: 'monospace',
            fontSize: 12
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#0f0', fontWeight: 'bold' }}>🛠️ Developer Panel</span>
                <button
                    onClick={() => setIsOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}
                >
                    ✕
                </button>
            </div>

            {/* Enable/Disable Override */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                <input
                    type="checkbox"
                    checked={devSettings.enabled}
                    onChange={(e) => onSettingsChange({ ...devSettings, enabled: e.target.checked })}
                />
                <span style={{ color: devSettings.enabled ? '#0f0' : '#888' }}>
                    Override Time/Day
                </span>
            </label>

            {/* Time Input */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', color: '#888', marginBottom: 4 }}>Time (HH:MM)</label>
                <input
                    type="time"
                    value={devSettings.time}
                    onChange={(e) => onSettingsChange({ ...devSettings, time: e.target.value })}
                    disabled={!devSettings.enabled}
                    style={{
                        width: '100%',
                        padding: 8,
                        background: '#2a2a4a',
                        border: '1px solid #444',
                        borderRadius: 4,
                        color: '#fff',
                        fontFamily: 'monospace'
                    }}
                />
            </div>

            {/* Day Select */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', color: '#888', marginBottom: 4 }}>Day</label>
                <select
                    value={devSettings.day}
                    onChange={(e) => onSettingsChange({ ...devSettings, day: e.target.value })}
                    disabled={!devSettings.enabled}
                    style={{
                        width: '100%',
                        padding: 8,
                        background: '#2a2a4a',
                        border: '1px solid #444',
                        borderRadius: 4,
                        color: '#fff',
                        fontFamily: 'monospace'
                    }}
                >
                    {days.map(day => (
                        <option key={day} value={day}>
                            {day.charAt(0).toUpperCase() + day.slice(1)}
                        </option>
                    ))}
                </select>
            </div>

            {/* Quick Presets */}
            <div style={{ marginBottom: 8, color: '#888' }}>Quick Presets:</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[
                    { label: 'Mon 8AM', time: '08:00', day: 'monday' },
                    { label: 'Fri 12:45', time: '12:45', day: 'friday' },
                    { label: 'Fri 14:00', time: '14:00', day: 'friday' },
                    { label: 'Sat 10AM', time: '10:00', day: 'saturday' },
                    { label: 'Sun 9AM', time: '09:00', day: 'sunday' },
                ].map(preset => (
                    <button
                        key={preset.label}
                        onClick={() => onSettingsChange({ enabled: true, time: preset.time, day: preset.day })}
                        style={{
                            padding: '4px 8px',
                            background: '#3a3a6a',
                            border: 'none',
                            borderRadius: 4,
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 10
                        }}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            {/* Current Status */}
            {devSettings.enabled && (
                <div style={{
                    marginTop: 12,
                    padding: 8,
                    background: '#0a0a1a',
                    borderRadius: 4,
                    color: '#0f0'
                }}>
                    Using: {devSettings.time} on {devSettings.day.charAt(0).toUpperCase() + devSettings.day.slice(1)}
                </div>
            )}
        </div>
    );
};

export default DevPanel;
