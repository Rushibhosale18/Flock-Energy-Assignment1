const express = require('express');
const router = express.Router();

/**
 * @param {import('../services/urja-client')} portalClient
 */
module.exports = function createNetworkRouter(portalClient) {
    /**
     * @swagger
     * /api/v1/transformers:
     *   get:
     *     summary: Retrieve distribution transformers in the grid
     *     tags: [Network Topology]
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *           default: 1
     *         description: Page number
     *     responses:
     *       200:
     *         description: List of distribution transformers
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/TransformerListResponse'
     */
    router.get('/transformers', async (req, res, next) => {
        try {
            const page = parseInt(req.query.page, 10) || 1;
            const result = await portalClient.getTransformers({ page });
            res.json(result);
        } catch (err) {
            next(err);
        }
    });

    /**
     * @swagger
     * /api/v1/hierarchy:
     *   get:
     *     summary: Retrieve organized network hierarchy tree from Zone down to connected meters
     *     description: Assembles the 7-tier electrical distribution network tree from live inventory and topology models.
     *     tags: [Network Topology]
     *     responses:
     *       200:
     *         description: Full electrical grid hierarchy tree
     */
    router.get('/hierarchy', async (req, res, next) => {
        try {
            const hierarchy = await portalClient.getHierarchy();
            res.json(hierarchy);
        } catch (err) {
            next(err);
        }
    });

    /**
     * @swagger
     * /api/v1/export:
     *   get:
     *     summary: Bulk export all 403 meters via HMAC-SHA256 signed request
     *     description: Utilizes the portal's cryptographic key derivation protocol to export complete grid models.
     *     tags: [Meters]
     *     responses:
     *       200:
     *         description: Complete inventory of all meters with full topology and GPS coordinates
     */
    router.get('/export', async (req, res, next) => {
        try {
            const fullData = await portalClient.getExportAll();
            res.json({
                total: fullData.length,
                meters: fullData
            });
        } catch (err) {
            next(err);
        }
    });

    return router;
};
