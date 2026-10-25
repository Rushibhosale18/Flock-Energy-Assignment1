const express = require('express');
const router = express.Router();

/**
 * @param {import('../services/urja-client')} portalClient
 */
module.exports = function createMetersRouter(portalClient) {
    /**
     * @swagger
     * /api/v1/meters:
     *   get:
     *     summary: Retrieve smart meters inventory with search and pagination
     *     description: Fetches live meter records from the Urja portal with normalized field types and search filtering.
     *     tags: [Meters]
     *     parameters:
     *       - in: query
     *         name: q
     *         schema:
     *           type: string
     *         description: Search query matching meter ID or serial number
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *           default: 1
     *         description: Page number (1-based)
     *       - in: query
     *         name: pageSize
     *         schema:
     *           type: integer
     *           default: 20
     *         description: Items per page
     *       - in: query
     *         name: all
     *         schema:
     *           type: boolean
     *           default: false
     *         description: If true, returns all 403 meters at once via bulk signed export
     *     responses:
     *       200:
     *         description: Paginated meters inventory
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/MeterListResponse'
     */
    router.get('/', async (req, res, next) => {
        try {
            const q = req.query.q || '';
            const page = parseInt(req.query.page, 10) || 1;
            const pageSize = parseInt(req.query.pageSize, 10) || 20;
            const all = req.query.all === 'true' || req.query.all === '1';

            const result = await portalClient.getMeters({ q, page, pageSize, all });
            
            // Standard JSON response with metadata
            res.json({
                total: result.total,
                page: result.page,
                page_size: result.page_size,
                total_pages: result.total_pages,
                data: result.data
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * @swagger
     * /api/v1/meters/{id}:
     *   get:
     *     summary: Get detailed specifications, hierarchy, and geo coordinates for a meter
     *     description: Scrapes SSR Nameplate specifications, retrieves GPS coordinates from internal geo service, and extracts electrical breadcrumbs.
     *     tags: [Meters]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Meter identifier (e.g., J100000)
     *     responses:
     *       200:
     *         description: Detailed meter record
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/MeterDetail'
     *       404:
     *         description: Meter ID not found
     */
    router.get('/:id', async (req, res, next) => {
        try {
            const meterId = req.params.id;
            const details = await portalClient.getMeterDetails(meterId);
            res.json(details);
        } catch (err) {
            next(err);
        }
    });

    /**
     * @swagger
     * /api/v1/meters/{id}/consumption:
     *   get:
     *     summary: Retrieve historical energy consumption readings and analytics summary
     *     description: Returns clean, chronological 30-minute interval readings with float conversions, ISO 8601 timestamps, and computed statistics.
     *     tags: [Meters]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Meter identifier (e.g., J100000)
     *     responses:
     *       200:
     *         description: Normalized consumption telemetry records and aggregate stats
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ConsumptionHistoryResponse'
     *       404:
     *         description: Meter not found
     */
    router.get('/:id/consumption', async (req, res, next) => {
        try {
            const meterId = req.params.id;
            const history = await portalClient.getMeterConsumption(meterId);
            res.json(history);
        } catch (err) {
            next(err);
        }
    });

    return router;
};
