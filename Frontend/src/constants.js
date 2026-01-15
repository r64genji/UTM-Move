/**
 * Shared constants for UTM Move application
 * Centralizes route colors and utility functions used across components
 */

// Route colors matching the CSS custom properties in index.css
export const ROUTE_COLORS = {
    'A': '#EF4444', // Red
    'B': '#F59E0B', // Amber
    'C': '#10B981', // Emerald
    'D': '#3B82F6', // Blue
    'E': '#8B5CF6', // Violet
    'F': '#EC4899', // Pink
    'G': '#14b8a6', // Teal
    'L': '#6366F1'  // Indigo
};

/**
 * Get the color for a given route name
 * @param {string} routeStr - Route name (e.g., "Route A", "A", "Route E(JA)")
 * @returns {string} Hex color code
 */
export const getRouteColor = (routeStr) => {
    if (!routeStr) return '#6B7280'; // Gray fallback
    // Extract the route letter: "Route A" -> "A", "Route E(JA)" -> "E"
    const letter = routeStr.replace(/^Route\s*/i, '').charAt(0).toUpperCase();
    return ROUTE_COLORS[letter] || '#6B7280';
};

// Default fallback color
export const DEFAULT_ROUTE_COLOR = '#6B7280';
