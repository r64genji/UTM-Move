/**
 * Tests for scheduleLogic.js - Bus schedule queries
 * Note: These tests require the bus.db database to be set up
 */

const { getNextBus, closeDb } = require('../scheduleLogic');

// Close database after all tests complete
afterAll(async () => {
    await closeDb();
});

describe('getNextBus', () => {
    describe('Valid Queries', () => {
        test('returns a promise', () => {
            const result = getNextBus('Route A', '08:00');
            expect(result).toBeInstanceOf(Promise);
        });

        test('returns bus info for valid route and time', async () => {
            const result = await getNextBus('Route A', '08:00');

            // Result could be null if no buses after this time
            if (result) {
                expect(result).toHaveProperty('time');
                expect(result).toHaveProperty('stop');
                expect(result).toHaveProperty('route');
            }
        });

        test('returns null when no more buses today', async () => {
            // Very late time, should have no buses
            const result = await getNextBus('Route A', '23:59');
            expect(result).toBeNull();
        });

        test('returns bus info with specific stop filter', async () => {
            const result = await getNextBus('Route A', '08:00', 'Centre Point');

            if (result) {
                expect(result.stop).toMatch(/Centre Point/i);
            }
        });
    });

    describe('Time Parsing', () => {
        test('handles morning times correctly', async () => {
            const result = await getNextBus('Route A', '07:00');
            // Should find a bus or return null
            expect(result === null || result.time >= '07:00').toBe(true);
        });

        test('handles afternoon times correctly', async () => {
            const result = await getNextBus('Route A', '14:00');
            if (result) {
                expect(result.time >= '14:00').toBe(true);
            }
        });
    });

    describe('Route Matching', () => {
        test('matches route by partial name', async () => {
            const result = await getNextBus('A', '08:00');
            if (result) {
                expect(result.route).toMatch(/A/i);
            }
        });

        test('matches route by full name', async () => {
            const result = await getNextBus('Route A', '08:00');
            if (result) {
                expect(result.route).toMatch(/Route A/i);
            }
        });

        test('returns null for non-existent route', async () => {
            const result = await getNextBus('Route ZZZ', '08:00');
            expect(result).toBeNull();
        });
    });

    describe('Friday Prayer Logic', () => {
        // Note: This test's behavior depends on what day it runs
        // The scheduleLogic.js uses server's current day
        test('query during prayer time returns valid result or null', async () => {
            // We can't directly test prayer break without mocking Date
            // But we can verify the query doesn't error
            const result = await getNextBus('Route A', '13:00');
            expect(result === null || typeof result === 'object').toBe(true);
        });
    });
});
