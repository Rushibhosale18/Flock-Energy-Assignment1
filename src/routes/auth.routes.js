const express = require('express');
const router = express.Router();

/**
 * Factory function injecting the UrjaPortalClient instance.
 * @param {import('../services/urja-client')} portalClient
 */
module.exports = function createAuthRouter(portalClient) {
    /**
     * @swagger
     * /api/v1/auth/login:
     *   post:
     *     summary: Authenticate operator session with legacy Urja Ops portal
     *     description: Initiates SvelteKit form authentication, validates CSRF origin headers, and establishes a secure session cookie.
     *     tags: [Authentication]
     *     requestBody:
     *       required: false
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LoginRequest'
     *     responses:
     *       200:
     *         description: Authentication successful and session cookie cached
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/LoginResponse'
     *       401:
     *         description: Invalid operator credentials
     *       403:
     *         description: CSRF Origin rejection by legacy portal
     */
    router.post('/login', async (req, res, next) => {
        try {
            if (req.body?.email && req.body?.password) {
                portalClient.email = req.body.email;
                portalClient.password = req.body.password;
            }
            await portalClient.login(true);
            res.json({
                success: true,
                data: {
                    status: 'authenticated',
                    authenticated_at: new Date(portalClient.lastAuthTime).toISOString(),
                    operator: portalClient.email,
                    session_expires_in_seconds: 3600
                },
                meta: {
                    request_id: req.id,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * @swagger
     * /api/v1/auth/status:
     *   get:
     *     summary: Check current cached session status
     *     tags: [Authentication]
     *     responses:
     *       200:
     *         description: Current session status
     */
    router.get('/status', (req, res) => {
        const isAuth = portalClient.authenticated;
        const ageSec = portalClient.lastAuthTime ? Math.floor((Date.now() - portalClient.lastAuthTime) / 1000) : null;
        res.json({
            success: true,
            data: {
                authenticated: isAuth,
                operator: portalClient.email,
                session_age_seconds: ageSec,
                ttl_remaining_seconds: ageSec !== null ? Math.max(0, 3600 - ageSec) : 0
            },
            meta: {
                request_id: req.id,
                timestamp: new Date().toISOString()
            }
        });
    });

    return router;
};
