/**
 * Tests for busLogic.js - Service availability logic
 */

const { isServiceActive } = require('../busLogic');

describe('isServiceActive', () => {
    describe('Friday Prayer Break (12:40 - 14:00)', () => {
        test('blocks service during Friday prayer time (13:00)', () => {
            const fridayPrayer = new Date('2026-01-09T13:00:00'); // Friday at 1:00 PM
            expect(isServiceActive('C1', fridayPrayer)).toBe(false);
        });

        test('blocks service at start of prayer break (12:40)', () => {
            const fridayStart = new Date('2026-01-09T12:40:00');
            expect(isServiceActive('C1', fridayStart)).toBe(false);
        });

        test('blocks service at 13:59 (still in prayer time)', () => {
            const fridayEnd = new Date('2026-01-09T13:59:00');
            expect(isServiceActive('C1', fridayEnd)).toBe(false);
        });

        test('allows service at 14:00 (prayer break ends)', () => {
            const afterPrayer = new Date('2026-01-09T14:00:00');
            expect(isServiceActive('C1', afterPrayer)).toBe(true);
        });

        test('allows service on Friday morning (10:00)', () => {
            const fridayMorning = new Date('2026-01-09T10:00:00');
            expect(isServiceActive('C1', fridayMorning)).toBe(true);
        });

        test('allows service on Friday before prayer (12:39)', () => {
            const beforePrayer = new Date('2026-01-09T12:39:00');
            expect(isServiceActive('C1', beforePrayer)).toBe(true);
        });

        test('allows service on Friday evening (16:00)', () => {
            const fridayEvening = new Date('2026-01-09T16:00:00');
            expect(isServiceActive('C1', fridayEvening)).toBe(true);
        });
    });

    describe('Non-Friday Days', () => {
        test('allows service on Monday at any time', () => {
            const mondayNoon = new Date('2026-01-05T12:45:00'); // Monday
            expect(isServiceActive('C1', mondayNoon)).toBe(true);
        });

        test('allows service on Saturday during prayer equivalent time', () => {
            const saturdayNoon = new Date('2026-01-10T13:00:00'); // Saturday
            expect(isServiceActive('C1', saturdayNoon)).toBe(true);
        });

        test('allows service on Sunday morning', () => {
            const sundayMorning = new Date('2026-01-11T09:00:00'); // Sunday
            expect(isServiceActive('C1', sundayMorning)).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        test('works with any routeId', () => {
            const routeA = isServiceActive('Route A', new Date('2026-01-05T10:00:00'));
            const routeB = isServiceActive('Route B', new Date('2026-01-05T10:00:00'));
            expect(routeA).toBe(true);
            expect(routeB).toBe(true);
        });

        test('handles midnight correctly', () => {
            const midnight = new Date('2026-01-09T00:00:00'); // Friday midnight
            expect(isServiceActive('C1', midnight)).toBe(true);
        });
    });
});
