const { AppError } = require('../errors/AppError');
const config = require('../config');

/**
 * Global standardized error-handling middleware.
 */
function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || (err.response ? err.response.status : 500);
    const errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred while processing the request.';

    // Log operational vs non-operational errors
    if (statusCode >= 500) {
        console.error(`[ERROR] [${req.id || 'N/A'}] Unhandled exception:`, err.stack || err);
    } else {
        console.warn(`[WARN] [${req.id || 'N/A'}] Operational warning (${statusCode}): ${message}`);
    }

    const payload = {
        success: false,
        error: {
            code: errorCode,
            message: message,
            details: err.details || (err.response?.data ? err.response.data : null)
        },
        meta: {
            request_id: req.id || null,
            timestamp: new Date().toISOString()
        }
    };

    if (config.env === 'development' && statusCode >= 500) {
        payload.error.stack = err.stack;
    }

    res.status(statusCode).json(payload);
}

module.exports = errorHandler;
