const express = require('express');
const router = express.Router();
const config = require('../config');
const metrics = require('../utils/metrics');

/**
 * @param {import('../services/urja-client')} portalClient
 * @param {Object} swaggerSpec
 */
module.exports = function createSystemRouter(portalClient, swaggerSpec) {
    /**
     * @swagger
     * /api/v1/health:
     *   get:
     *     summary: Comprehensive system health and upstream connectivity check
     *     tags: [System]
     *     responses:
     *       200:
     *         description: Service is healthy and connected to legacy Urja portal
     */
    router.get('/health', async (req, res) => {
        try {
            const health = await portalClient.checkHealth();
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                environment: config.env,
                service: 'flock-energy-api',
                version: '1.0.0',
                uptime_seconds: Math.floor(process.uptime()),
                memory_usage: process.memoryUsage(),
                upstream: health
            });
        } catch (err) {
            res.status(502).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: err.message,
                upstream: {
                    portal: portalClient.baseUrl,
                    authenticated: false
                }
            });
        }
    });

    /**
     * Prometheus / OpenMetrics scraping endpoint
     */
    router.get('/metrics', (req, res) => {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        const cacheStats = portalClient.cache ? portalClient.cache.getStats() : {};
        res.send(metrics.toPrometheusFormat(cacheStats));
    });

    /**
     * Export raw OpenAPI specification
     */
    router.get('/openapi.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.json(swaggerSpec);
    });

    return router;
};
