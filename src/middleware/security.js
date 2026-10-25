const { AppError } = require('../errors/AppError');

/**
 * Enterprise HTTP Security Headers (Helmet.js equivalent)
 */
function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Content Security Policy permitting local assets and trusted CDNs (Chart.js & Google Fonts)
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' http://localhost:* https://urja-ops.flockenergy.tech"
    );
    next();
}

/**
 * Production Cross-Origin Resource Sharing (CORS) handler
 */
function corsMiddleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id');
    res.setHeader('Access-Control-Expose-Headers', 'x-request-id, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
}

/**
 * In-Memory Sliding Window Rate Limiter
 * Protects downstream services and upstream portal from traffic spikes.
 */
class RateLimiter {
    /**
     * @param {number} windowMs Time window in ms (default: 60s)
     * @param {number} maxRequests Maximum requests allowed per window (default: 120)
     */
    constructor(windowMs = 60000, maxRequests = 120) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.clients = new Map(); // ip -> Array of timestamps

        // Garbage collection every 2 minutes
        setInterval(() => this.cleanup(), 120000).unref();
    }

    middleware() {
        return (req, res, next) => {
            // Bypass rate limiting for static dashboard assets or health checks
            if (req.path === '/api/v1/health' || req.path === '/metrics' || req.path === '/docs') {
                return next();
            }

            const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
            const now = Date.now();
            const windowStart = now - this.windowMs;

            let timestamps = this.clients.get(ip) || [];
            timestamps = timestamps.filter(ts => ts > windowStart);

            const remaining = Math.max(0, this.maxRequests - timestamps.length);
            const resetTime = Math.ceil((windowStart + this.windowMs) / 1000);

            res.setHeader('RateLimit-Limit', this.maxRequests);
            res.setHeader('RateLimit-Remaining', remaining);
            res.setHeader('RateLimit-Reset', resetTime);

            if (timestamps.length >= this.maxRequests) {
                res.setHeader('Retry-After', Math.ceil(this.windowMs / 1000));
                return res.status(429).json({
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: `Too many requests from client IP. Exceeded ${this.maxRequests} requests per minute limit.`,
                        retry_after_seconds: Math.ceil(this.windowMs / 1000)
                    },
                    meta: {
                        request_id: req.id,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            timestamps.push(now);
            this.clients.set(ip, timestamps);
            next();
        };
    }

    cleanup() {
        const threshold = Date.now() - this.windowMs;
        for (const [ip, timestamps] of this.clients.entries()) {
            const active = timestamps.filter(ts => ts > threshold);
            if (active.length === 0) {
                this.clients.delete(ip);
            } else {
                this.clients.set(ip, active);
            }
        }
    }
}

/**
 * Strict Input Validation Middleware
 */
function validateMeterParams(req, res, next) {
    const meterId = req.params.id;
    if (meterId && !/^[A-Za-z0-9_-]{3,32}$/.test(meterId)) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_PARAMETER',
                message: `Invalid meter ID format: '${meterId}'. Meter ID must be 3-32 alphanumeric characters.`
            },
            meta: {
                request_id: req.id,
                timestamp: new Date().toISOString()
            }
        });
    }
    next();
}

function validatePaginationParams(req, res, next) {
    if (req.query.page) {
        const page = parseInt(req.query.page, 10);
        if (isNaN(page) || page < 1) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PAGINATION',
                    message: "Query parameter 'page' must be a positive integer >= 1."
                },
                meta: { request_id: req.id, timestamp: new Date().toISOString() }
            });
        }
    }

    if (req.query.pageSize) {
        const pageSize = parseInt(req.query.pageSize, 10);
        if (isNaN(pageSize) || pageSize < 1 || pageSize > 200) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PAGINATION',
                    message: "Query parameter 'pageSize' must be between 1 and 200."
                },
                meta: { request_id: req.id, timestamp: new Date().toISOString() }
            });
        }
    }

    next();
}

const defaultRateLimiter = new RateLimiter(60000, 150);

module.exports = {
    securityHeaders,
    corsMiddleware,
    rateLimiter: defaultRateLimiter.middleware(),
    validateMeterParams,
    validatePaginationParams
};
