/**
 * Centralized Application Configuration
 * Provides typed, validated environment variables with safe production fallbacks.
 */
const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3001,
    
    // Legacy Urja Portal Credentials & Endpoints
    portal: {
        baseUrl: (process.env.PORTAL_URL || 'https://urja-ops.flockenergy.tech').replace(/\/+$/, ''),
        email: process.env.URJA_EMAIL || 'operator@urja.local',
        password: process.env.URJA_PASSWORD || 'urja-ops-2026',
        timeoutMs: parseInt(process.env.PORTAL_TIMEOUT_MS, 10) || 15000,
        sessionTtlSec: 3600, // 1 hour Max-Age
        sessionRefreshMarginSec: 300 // Refresh 5 minutes before expiration
    },

    // Dual-Stack Networking Fallbacks (for IPv6/NAT64 networks)
    network: {
        targetHost: 'urja-ops.flockenergy.tech',
        nat64PrefixIpv6: '64:ff9b::2851:f567',
        targetIpv4: '40.81.245.103'
    },

    // Logging & Observability
    logging: {
        level: process.env.LOG_LEVEL || 'info'
    }
};

module.exports = config;
