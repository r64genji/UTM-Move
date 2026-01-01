function isServiceActive(routeId, dateObj) {
    const day = dateObj.getDay(); // 0=Sun, 5=Fri
    const hour = dateObj.getHours();
    const minute = dateObj.getMinutes();
    const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    // RULE: Friday Prayer Break (12:40 - 14:00)
    if (day === 5) { 
        if (timeString >= "12:40" && timeString < "14:00") {
            return false; 
        }
    }
    return true; 
}
module.exports = { isServiceActive };