/**
 * Input Validation Utilities
 * 
 * Security-focused validation and sanitization helpers for API inputs.
 */

/**
 * Validate numeric coordinate (lat/lon)
 * @param {string|number} val - Value to validate
 * @param {string} name - Name for error message (e.g., 'latitude')
 * @returns {{valid: boolean, value?: number, error?: string}}
 */
function validateCoord(val, name) {
    if (val === null || val === undefined || val === '') {
        return { valid: false, error: `${name} is required` };
    }

    const num = parseFloat(val);
    if (isNaN(num)) {
        return { valid: false, error: `Invalid ${name}: must be a number` };
    }

    if (num < -180 || num > 180) {
        return { valid: false, error: `Invalid ${name}: must be between -180 and 180` };
    }

    return { valid: true, value: num };
}

/**
 * Validate time string in HH:MM format
 * @param {string} val - Time string to validate
 * @returns {{valid: boolean, value?: string|null, error?: string}}
 */
function validateTime(val) {
    // Allow null/undefined/empty - optional field
    if (val === null || val === undefined || val === '') {
        return { valid: true, value: null };
    }

    // Check HH:MM format (24-hour)
    if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(val)) {
        return { valid: false, error: 'Invalid time format: use HH:MM (24-hour)' };
    }

    return { valid: true, value: val };
}

/**
 * Validate day of week
 * @param {string} val - Day string to validate
 * @returns {{valid: boolean, value?: string|null, error?: string}}
 */
function validateDay(val) {
    if (val === null || val === undefined || val === '') {
        return { valid: true, value: null };
    }

    const validDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const normalized = String(val).toLowerCase().trim();

    if (!validDays.includes(normalized)) {
        return { valid: false, error: `Invalid day: must be one of ${validDays.join(', ')}` };
    }

    return { valid: true, value: normalized };
}

/**
 * Sanitize string input to prevent XSS and limit length
 * @param {string} val - String to sanitize
 * @param {number} maxLen - Maximum allowed length (default: 100)
 * @returns {string|null} - Sanitized string or null
 */
function sanitizeString(val, maxLen = 100) {
    if (val === null || val === undefined) {
        return null;
    }

    // Convert to string, trim, truncate, and remove dangerous characters
    return String(val)
        .trim()
        .slice(0, maxLen)
        .replace(/[<>]/g, '')       // Remove < and > to prevent HTML injection
        .replace(/javascript:/gi, '')  // Remove javascript: protocol
        .replace(/on\w+=/gi, '');      // Remove event handlers like onclick=
}

/**
 * Validate route name
 * @param {string} val - Route name to validate
 * @returns {{valid: boolean, value?: string, error?: string}}
 */
function validateRouteName(val) {
    if (!val) {
        return { valid: false, error: 'Route name is required' };
    }

    const sanitized = sanitizeString(val, 50);
    if (!sanitized || sanitized.length === 0) {
        return { valid: false, error: 'Invalid route name' };
    }

    return { valid: true, value: sanitized };
}

/**
 * Validate location/stop ID
 * @param {string} val - ID to validate
 * @returns {{valid: boolean, value?: string, error?: string}}
 */
function validateLocationId(val) {
    if (!val) {
        return { valid: false, error: 'Location ID is required' };
    }

    // Allow alphanumeric, underscores, hyphens
    const sanitized = sanitizeString(val, 100);
    if (!/^[a-zA-Z0-9_\-\s\.]+$/.test(sanitized)) {
        return { valid: false, error: 'Invalid location ID format' };
    }

    return { valid: true, value: sanitized };
}

module.exports = {
    validateCoord,
    validateTime,
    validateDay,
    sanitizeString,
    validateRouteName,
    validateLocationId
};
