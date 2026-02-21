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

    // Latitude range: -90 to 90; Longitude range: -180 to 180
    const isLat = name.toLowerCase().includes('lat');
    const min = isLat ? -90 : -180;
    const max = isLat ? 90 : 180;
    if (num < min || num > max) {
        return { valid: false, error: `Invalid ${name}: must be between ${min} and ${max}` };
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

/**
 * Validate report input with strict security checks
 * @param {string} type - Report type
 * @param {string} details - Report details
 * @returns {{valid: boolean, error?: string, sanitizedDetails?: string}}
 */
function validateReportInput(type, details) {
    // 1. Strict Allowlist for Type
    const validTypes = ['new_stop', 'remove_stop', 'route_fix'];
    if (!validTypes.includes(type)) {
        return { valid: false, error: 'Invalid report type' };
    }

    // 2. Details Length Check
    if (!details || typeof details !== 'string') {
        return { valid: false, error: 'Details are required' };
    }

    // Use length of trimmed string
    const trimmedLength = details.trim().length;
    if (trimmedLength < 10) {
        return { valid: false, error: 'Details must be at least 10 characters' };
    }
    if (trimmedLength > 2000) {
        return { valid: false, error: 'Details must be under 2000 characters' };
    }

    // 3. Security Sanitization (Anti-Injection)
    const sanitized = sanitizeReportDetails(details);
    if (!sanitized) {
        return { valid: false, error: 'Invalid characters in details' };
    }

    return { valid: true, sanitizedDetails: sanitized };
}

/**
 * Sanitize report details to prevent XSS, SQLi, and Log Injection
 * @param {string} text 
 * @returns {string}
 */
function sanitizeReportDetails(text) {
    if (!text) return '';

    let clean = text.trim();

    // A. Anti-XSS (HTML stripping)
    clean = clean.replace(/[<>]/g, '');

    // B. Anti-Log Injection (Replace newlines/tabs with spaces or escaped versions if strictly needed)
    // allowing newlines but escaping other control chars might be better for readability
    // For now, let's allow basic newlines for formatting but strip others
    clean = clean.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');

    // C. Anti-SQL Injection (Keyword scrubbing - Defensive Depth)
    // Note: Parameterized queries are the real fix, but this is requested as a feature
    const sqlKeywords = [
        /\bUNION\s+SELECT\b/gi,
        /\bDROP\s+TABLE\b/gi,
        /\bINSERT\s+INTO\b/gi,
        /\bDELETE\s+FROM\b/gi,
        /\bUPDATE\s+\w+\s+SET\b/gi,
        /--/g // SQL comments
    ];

    for (const pattern of sqlKeywords) {
        clean = clean.replace(pattern, '[REDACTED_SQL]');
    }

    return clean;
}

module.exports = {
    validateCoord,
    validateTime,
    validateDay,
    sanitizeString,
    validateRouteName,
    validateLocationId,
    validateReportInput
};
