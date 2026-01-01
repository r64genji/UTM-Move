const { isServiceActive } = require('./busLogic');

test('Block service during Friday Prayer', () => {
    // Friday at 1:00 PM
    const fridayPrayer = new Date('2025-10-10T13:00:00'); 
    expect(isServiceActive('C1', fridayPrayer)).toBe(false);
});

test('Allow service on normal Friday morning', () => {
    // Friday at 10:00 AM
    const fridayMorning = new Date('2025-10-10T10:00:00');
    expect(isServiceActive('C1', fridayMorning)).toBe(true);
});