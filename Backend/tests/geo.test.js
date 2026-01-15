/**
 * Tests for utils/geo.js - Geographic utility functions
 */

const { haversineDistance, getPathDistance } = require('../utils/geo');

describe('haversineDistance', () => {
    test('returns 0 for same coordinates', () => {
        const distance = haversineDistance(1.5553, 103.6389, 1.5553, 103.6389);
        expect(distance).toBe(0);
    });

    test('calculates correct distance between two known points', () => {
        // UTM Centre Point to Kolej 9 (approximately 1.2km)
        const cpLat = 1.5589;
        const cpLon = 103.6378;
        const k9Lat = 1.5533;
        const k9Lon = 103.6443;

        const distance = haversineDistance(cpLat, cpLon, k9Lat, k9Lon);

        // Should be around 900-1000m
        expect(distance).toBeGreaterThan(800);
        expect(distance).toBeLessThan(1200);
    });

    test('is symmetric (A to B equals B to A)', () => {
        const lat1 = 1.5553, lon1 = 103.6389;
        const lat2 = 1.5600, lon2 = 103.6400;

        const distAB = haversineDistance(lat1, lon1, lat2, lon2);
        const distBA = haversineDistance(lat2, lon2, lat1, lon1);

        expect(distAB).toBeCloseTo(distBA, 5);
    });

    test('handles negative coordinates', () => {
        const distance = haversineDistance(-33.8688, 151.2093, -33.8688, 151.2093);
        expect(distance).toBe(0);
    });
});

describe('getPathDistance', () => {
    test('returns 0 for single point path', () => {
        const coords = [[103.6389, 1.5553]]; // GeoJSON format [lon, lat]
        const distance = getPathDistance(coords);
        expect(distance).toBe(0);
    });

    test('returns 0 for empty path', () => {
        const coords = [];
        const distance = getPathDistance(coords);
        expect(distance).toBe(0);
    });

    test('calculates correct total distance for multi-point path', () => {
        // Three points forming a straight-ish line
        const coords = [
            [103.6378, 1.5589], // CP
            [103.6400, 1.5570], // Midpoint
            [103.6443, 1.5533]  // K9
        ];

        const totalDist = getPathDistance(coords);

        // Should be roughly similar to direct distance CP -> K9
        expect(totalDist).toBeGreaterThan(800);
        expect(totalDist).toBeLessThan(1500);
    });

    test('path distance is >= direct distance (triangle inequality)', () => {
        const coords = [
            [103.6378, 1.5589], // Start
            [103.6450, 1.5600], // Detour point
            [103.6443, 1.5533]  // End
        ];

        const pathDist = getPathDistance(coords);
        const directDist = haversineDistance(1.5589, 103.6378, 1.5533, 103.6443);

        expect(pathDist).toBeGreaterThanOrEqual(directDist);
    });
});
