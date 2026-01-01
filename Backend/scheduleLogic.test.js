// scheduleLogic.test.js
const { getNextBus } = require('./scheduleLogic');

test('Finds the next bus when schedule is available', () => {
    // If it's 08:15, the next bus for route-A (09:00) should be returned
    expect(getNextBus('route-A', '08:15')).toBe('09:00');
});

test('Returns error message for invalid route', () => {
    expect(getNextBus('route-Z', '10:00')).toBe('Route not found');
});

test('Returns message when day is over', () => {
    // Route A's last bus is 16:00. If it's 17:00, there are no buses.
    expect(getNextBus('route-A', '17:00')).toBe('No more buses today');
});