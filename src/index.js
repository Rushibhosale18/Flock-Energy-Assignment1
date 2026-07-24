const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const UrjaClient = require('./client');

const app = express();
app.use(express.json());

// Initialize legacy client
const PORTAL_URL = process.env.PORTAL_URL || 'https://urja-ops.flockenergy.tech';
// Hardcoded defaults based on task requirements, normally these would be env vars
const portalClient = new UrjaClient(
    PORTAL_URL, 
    process.env.URJA_EMAIL || 'operator@urja.local', 
    process.env.URJA_PASSWORD || 'urja-ops-2026'
);

/**
 * @swagger
 * components:
 *   schemas:
 *     Meter:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: The meter identifier
 *         serial:
 *           type: string
 *         status:
 *           type: string
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 */

/**
 * @swagger
 * /api/v1/meters:
 *   get:
 *     summary: Retrieve a list of smart meters
 *     tags: [Meters]
 *     responses:
 *       200:
 *         description: A list of meters
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Meter'
 *       500:
 *         description: Internal server error
 */
app.get('/api/v1/meters', async (req, res) => {
    try {
        const meters = await portalClient.getMeters();
        res.json(meters);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/v1/meters/{id}:
 *   get:
 *     summary: Get specific meter details
 *     tags: [Meters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The meter ID
 *     responses:
 *       200:
 *         description: Meter details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Meter'
 *       500:
 *         description: Internal server error
 */
app.get('/api/v1/meters/:id', async (req, res) => {
    try {
        const details = await portalClient.getMeterDetails(req.params.id);
        res.json(details);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/v1/meters/{id}/consumption:
 *   get:
 *     summary: Get consumption history for a meter
 *     tags: [Meters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consumption history
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       500:
 *         description: Internal server error
 */
app.get('/api/v1/meters/:id/consumption', async (req, res) => {
    try {
        const history = await portalClient.getMeterConsumption(req.params.id);
        res.json(history);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/v1/hierarchy:
 *   get:
 *     summary: Retrieve organized network tree
 *     tags: [Network]
 *     responses:
 *       200:
 *         description: Network hierarchy (Transformers/Meters)
 *       500:
 *         description: Internal server error
 */
app.get('/api/v1/hierarchy', async (req, res) => {
    try {
        const hierarchy = await portalClient.getHierarchy();
        res.json(hierarchy);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Swagger Setup
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Flock Energy - Urja Meter Ops API',
            version: '1.0.0',
            description: 'REST API wrapper over the legacy Urja portal.',
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Local server'
            }
        ],
    },
    apis: ['./src/index.js'], // files containing annotations
};

// Serve static files (like our premium landing page and custom CSS)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

const swaggerSpec = swaggerJsdoc(options);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCssUrl: '/swagger-custom.css',
    customSiteTitle: 'Flock Energy API Docs'
}));

// Export openapi.json route
app.get('/openapi.json', (req, res) => {
    res.json(swaggerSpec);
});

// Server Listen
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Urja API Wrapper listening on port ${PORT}`);
    console.log(`Swagger UI available at http://localhost:${PORT}/docs`);
    console.log(`OpenAPI Spec available at http://localhost:${PORT}/openapi.json`);
});
