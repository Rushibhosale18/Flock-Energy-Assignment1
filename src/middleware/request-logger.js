const crypto = require('crypto');

/**
 * Request tracking and structured latency logger middleware.
 */
function requestLogger(req, res, next) {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = requestId;
    res.setHeader('x-request-id', requestId);

    const startTime = process.hrtime();

    res.on('finish', () => {
        const diff = process.hrtime(startTime);
        const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
        const status = res.statusCode;
        const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
        const reset = '\x1b[0m';

        console.log(`[${new Date().toISOString()}] [${req.id.slice(0, 8)}] ${req.method} ${req.originalUrl} ${color}${status}${reset} - ${durationMs}ms`);
    });

    next();
}

module.exports = requestLogger;
