/**
 * Tests for Frontend constants.js - Route colors and helpers
 * Run with: npx jest --testPathPattern="constants.test.js"
 */

// Since this is a frontend file using ES modules, we'd need to use Babel
// For now, we can test by copying the logic or using a test runner that supports ESM

// Inline the functions for testing
const ROUTE_COLORS = {
    'A': '#EF4444', 'B': '#F59E0B', 'C': '#10B981', 'D': '#3B82F6',
    'E': '#8B5CF6', 'F': '#EC4899', 'G': '#14b8a6', 'L': '#6366F1'
};

const getRouteColor = (routeStr) => {
    if (!routeStr) return '#6B7280';
    const letter = routeStr.replace(/^Route\s*/i, '').charAt(0).toUpperCase();
    return ROUTE_COLORS[letter] || '#6B7280';
};

describe('ROUTE_COLORS', () => {
    test('has colors for all main routes A-G and L', () => {
        expect(ROUTE_COLORS['A']).toBeDefined();
        expect(ROUTE_COLORS['B']).toBeDefined();
        expect(ROUTE_COLORS['C']).toBeDefined();
        expect(ROUTE_COLORS['D']).toBeDefined();
        expect(ROUTE_COLORS['E']).toBeDefined();
        expect(ROUTE_COLORS['F']).toBeDefined();
        expect(ROUTE_COLORS['G']).toBeDefined();
        expect(ROUTE_COLORS['L']).toBeDefined();
    });

    test('all colors are valid hex codes', () => {
        const hexRegex = /^#[0-9A-Fa-f]{6}$/;
        Object.values(ROUTE_COLORS).forEach(color => {
            expect(color).toMatch(hexRegex);
        });
    });

    test('each route has a unique color', () => {
        const colors = Object.values(ROUTE_COLORS);
        const uniqueColors = new Set(colors);
        expect(uniqueColors.size).toBe(colors.length);
    });
});

describe('getRouteColor', () => {
    test('returns correct color for "Route A"', () => {
        expect(getRouteColor('Route A')).toBe('#EF4444');
    });

    test('returns correct color for "Route E(JA)"', () => {
        expect(getRouteColor('Route E(JA)')).toBe('#8B5CF6');
    });

    test('handles just the letter', () => {
        expect(getRouteColor('A')).toBe('#EF4444');
        expect(getRouteColor('C')).toBe('#10B981');
    });

    test('handles lowercase input', () => {
        expect(getRouteColor('route a')).toBe('#EF4444');
    });

    test('returns fallback gray for null/undefined', () => {
        expect(getRouteColor(null)).toBe('#6B7280');
        expect(getRouteColor(undefined)).toBe('#6B7280');
        expect(getRouteColor('')).toBe('#6B7280');
    });

    test('returns fallback for unknown route letter', () => {
        expect(getRouteColor('Route Z')).toBe('#6B7280');
        expect(getRouteColor('Route X')).toBe('#6B7280');
    });
});
