/**
 * directionLogic.js - Backward-compatible re-export
 * 
 * This file now delegates to the modular directions/ folder.
 * All functionality is preserved for existing imports.
 */

const { haversineDistance } = require('./utils/geo');
const {
    getDirections,
    findNearestStops,
    getRoutesForStop,
    findDirectRoutes,
    findTransferRoutes,
    getStopById,
    getLocationById
} = require('./directions');

module.exports = {
    getDirections,
    findNearestStops,
    getRoutesForStop,
    findDirectRoutes,
    findTransferRoutes,
    haversineDistance,
    getStopById,
    getLocationById
};
