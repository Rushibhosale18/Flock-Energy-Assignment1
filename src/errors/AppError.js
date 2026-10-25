/**
 * Standard Application Error Taxonomy
 */
class AppError extends Error {
    constructor(message, statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed with upstream legacy portal', details = null) {
        super(message, 401, 'UPSTREAM_AUTH_FAILED', details);
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Access forbidden by upstream portal CSRF protection', details = null) {
        super(message, 403, 'UPSTREAM_FORBIDDEN', details);
    }
}

class NotFoundError extends AppError {
    constructor(resource = 'Resource', identifier = '') {
        const msg = identifier ? `${resource} '${identifier}' was not found.` : `${resource} was not found.`;
        super(msg, 404, 'NOT_FOUND', { resource, identifier });
    }
}

class UpstreamGatewayError extends AppError {
    constructor(message = 'Error communicating with legacy Urja portal', details = null) {
        super(message, 502, 'BAD_GATEWAY', details);
    }
}

class GatewayTimeoutError extends AppError {
    constructor(message = 'Request to legacy Urja portal timed out', details = null) {
        super(message, 504, 'GATEWAY_TIMEOUT', details);
    }
}

module.exports = {
    AppError,
    AuthenticationError,
    ForbiddenError,
    NotFoundError,
    UpstreamGatewayError,
    GatewayTimeoutError
};
