const express = require('express');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const UrjaClient = require('./client');

const app = express();
app.use(express.json());

// Initialize Urja Portal adapter
const PORTAL_URL = process.env.PORTAL_URL || 'https://urja-ops.flockenergy.tech';
const URJA_EMAIL = process.env.URJA_EMAIL || 'operator@urja.local';
const URJA_PASSWORD = process.env.URJA_PASSWORD || 'urja-ops-2026';

const portalClient = new UrjaClient(PORTAL_URL, URJA_EMAIL, URJA_PASSWORD);

// Swagger Documentation Definition
const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Flock Energy - Urja Meter Ops API',
        version: '1.0.0',
        description: 'Clean, modern, and documented REST API wrapper over the legacy Urja Meter Ops web portal. Automates SvelteKit session management, handles CSRF protection, queries internal telemetry APIs, parses SSR Nameplate HTML, and normalizes smart meter data structures.',
        contact: {
            name: 'Flock Energy Engineering'
        }
    },
    servers: [
        {
            url: 'http://localhost:3001',
            description: 'Local API server'
        }
    ],
    tags: [
        { name: 'Authentication', description: 'Session management and portal authentication' },
        { name: 'Meters', description: 'Smart meter inventory, telemetry, and detailed diagnostics' },
        { name: 'Network Topology', description: 'Distribution transformer and electrical grid hierarchy' },
        { name: 'System', description: 'Health and service diagnostics' }
    ],
    components: {
        schemas: {
            LoginRequest: {
                type: 'object',
                properties: {
                    email: { type: 'string', example: 'operator@urja.local' },
                    password: { type: 'string', example: 'urja-ops-2026' }
                }
            },
            LoginResponse: {
                type: 'object',
                properties: {
                    status: { type: 'string', example: 'authenticated' },
                    authenticated_at: { type: 'string', format: 'date-time' },
                    operator: { type: 'string', example: 'operator@urja.local' }
                }
            },
            MeterSummary: {
                type: 'object',
                properties: {
                    meter_id: { type: 'string', example: 'J100000' },
                    serial_number: { type: 'string', example: 'SE33962' },
                    make: { type: 'string', example: 'HPL' },
                    phase_type: { type: 'string', example: 'single' },
                    install_status: { type: 'string', example: 'Decommissioned' },
                    install_type: { type: 'string', example: 'Whole Current', nullable: true },
                    dt_code: { type: 'string', example: 'DT-001' }
                }
            },
            MeterListResponse: {
                type: 'object',
                properties: {
                    total: { type: 'integer', example: 403 },
                    page: { type: 'integer', example: 1 },
                    page_size: { type: 'integer', example: 20 },
                    total_pages: { type: 'integer', example: 21 },
                    data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/MeterSummary' }
                    }
                }
            },
            GeoCoordinates: {
                type: 'object',
                properties: {
                    latitude: { type: 'number', format: 'float', example: 26.938961 },
                    longitude: { type: 'number', format: 'float', example: 75.830957 }
                }
            },
            MeterHierarchyBreadcrumb: {
                type: 'object',
                properties: {
                    zone: { type: 'string', example: 'Jaipur Zone 1 (Z-01)' },
                    circle: { type: 'string', example: 'Circle 1 (C-01)' },
                    division: { type: 'string', example: 'Division 1 (D-01)' },
                    subdivision: { type: 'string', example: 'Subdivision 1 (SD-01)' },
                    substation: { type: 'string', example: 'Substation 1 (SS-01)' },
                    feeder: { type: 'string', example: 'Feeder 1 (F-001)' },
                    dt: { type: 'string', example: 'Malviya Nagar DT 1 (DT-001)' }
                }
            },
            MeterDetail: {
                type: 'object',
                properties: {
                    meter_id: { type: 'string', example: 'J100000' },
                    serial_number: { type: 'string', example: 'SE33962' },
                    make: { type: 'string', example: 'HPL' },
                    phase_type: { type: 'string', example: 'single' },
                    install_status: { type: 'string', example: 'Decommissioned' },
                    install_type: { type: 'string', example: 'Whole Current' },
                    dt_code: { type: 'string', example: 'DT-001' },
                    geo: { $ref: '#/components/schemas/GeoCoordinates' },
                    hierarchy: { $ref: '#/components/schemas/MeterHierarchyBreadcrumb' },
                    raw_attributes: {
                        type: 'object',
                        additionalProperties: { type: 'string' }
                    }
                }
            },
            ConsumptionReading: {
                type: 'object',
                properties: {
                    timestamp: { type: 'string', format: 'date-time', example: '2026-06-23T23:30:00Z' },
                    raw_timestamp: { type: 'string', example: '23/06/2026 23:30' },
                    kwh: { type: 'number', format: 'float', example: 48438.74 },
                    kvah: { type: 'number', format: 'float', example: 52313.84 },
                    voltage_r: { type: 'number', format: 'float', example: 226.0 }
                }
            },
            ConsumptionHistoryResponse: {
                type: 'object',
                properties: {
                    meter_id: { type: 'string', example: 'J100000' },
                    total_readings: { type: 'integer', example: 337 },
                    time_window: {
                        type: 'object',
                        properties: {
                            start: { type: 'string', format: 'date-time' },
                            end: { type: 'string', format: 'date-time' }
                        }
                    },
                    summary: {
                        type: 'object',
                        properties: {
                            latest_kwh: { type: 'number', format: 'float', example: 48580.79 },
                            latest_kvah: { type: 'number', format: 'float', example: 52467.25 },
                            latest_voltage_r: { type: 'number', format: 'float', example: 220.0 },
                            average_voltage_r: { type: 'number', format: 'float', example: 229.83 }
                        }
                    },
                    readings: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ConsumptionReading' }
                    }
                }
            },
            Transformer: {
                type: 'object',
                properties: {
                    code: { type: 'string', example: 'DT-001' },
                    name: { type: 'string', example: 'Malviya Nagar DT 1' },
                    feeder_code: { type: 'string', example: 'F-001' },
                    capacity_kva: { type: 'number', example: 100 }
                }
            },
            TransformerListResponse: {
                type: 'object',
                properties: {
                    total: { type: 'integer', example: 40 },
                    page: { type: 'integer', example: 1 },
                    page_size: { type: 'integer', example: 20 },
                    total_pages: { type: 'integer', example: 2 },
                    data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Transformer' }
                    }
                }
            },
            ErrorResponse: {
                type: 'object',
                properties: {
                    error: { type: 'string', example: 'Meter not found or upstream error' },
                    status_code: { type: 'integer', example: 500 }
                }
            }
        }
    }
};

const swaggerOptions = {
    swaggerDefinition,
    apis: [__filename]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Also persist openapi.json to repository root
try {
    fs.writeFileSync(path.join(__dirname, '..', 'openapi.json'), JSON.stringify(swaggerSpec, null, 2), 'utf8');
} catch (e) {
    console.warn('[Swagger] Could not write openapi.json to root:', e.message);
}

// Serve Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCssUrl: '/swagger-custom.css',
    customSiteTitle: 'Flock Energy - Urja Ops API Docs'
}));

// Export openapi.json endpoint
app.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerSpec);
});

// Serve modern frontend web dashboard
app.use(express.static(path.join(__dirname, 'public')));

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: System health check and portal connectivity status
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy and connected to legacy Urja portal
 */
app.get('/api/v1/health', async (req, res) => {
    try {
        const isAuth = portalClient.authenticated;
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            legacy_portal: PORTAL_URL,
            session_authenticated: isAuth
        });
    } catch (err) {
        res.status(500).json({ status: 'unhealthy', error: err.message });
    }
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Trigger authentication or re-authentication against the Urja portal
 *     tags: [Authentication]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       500:
 *         description: Authentication failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        if (req.body?.email && req.body?.password) {
            portalClient.email = req.body.email;
            portalClient.password = req.body.password;
        }
        await portalClient.login(true);
        res.json({
            status: 'authenticated',
            authenticated_at: new Date(portalClient.lastAuthTime).toISOString(),
            operator: portalClient.email
        });
    } catch (err) {
        res.status(500).json({ error: err.message, status_code: 500 });
    }
});

/**
 * @swagger
 * /api/v1/meters:
 *   get:
 *     summary: Retrieve a list of smart meters with search and pagination
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
 *         description: If true, returns all 403 meters at once via signed export
 *     responses:
 *       200:
 *         description: Successfully retrieved meters list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeterListResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/v1/meters', async (req, res) => {
    try {
        const q = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const all = req.query.all === 'true' || req.query.all === '1';

        const result = await portalClient.getMeters({ q, page, pageSize, all });
        res.json(result);
    } catch (err) {
        console.error('[API] /meters error:', err.message);
        res.status(500).json({ error: err.message, status_code: 500 });
    }
});

/**
 * @swagger
 * /api/v1/meters/{id}:
 *   get:
 *     summary: Get detailed specifications, hierarchy, and geo coordinates for a specific meter
 *     tags: [Meters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique meter identifier (e.g., J100000)
 *     responses:
 *       200:
 *         description: Detailed meter diagnostic record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeterDetail'
 *       404:
 *         description: Meter not found
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/v1/meters/:id', async (req, res) => {
    try {
        const details = await portalClient.getMeterDetails(req.params.id);
        res.json(details);
    } catch (err) {
        console.error(`[API] /meters/${req.params.id} error:`, err.message);
        res.status(500).json({ error: err.message, status_code: 500 });
    }
});

/**
 * @swagger
 * /api/v1/meters/{id}/consumption:
 *   get:
 *     summary: Retrieve historical energy consumption readings and statistical summary for a meter
 *     tags: [Meters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique meter identifier (e.g., J100000)
 *     responses:
 *       200:
 *         description: Normalized consumption telemetry and analytics summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConsumptionHistoryResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/v1/meters/:id/consumption', async (req, res) => {
    try {
        const history = await portalClient.getMeterConsumption(req.params.id);
        res.json(history);
    } catch (err) {
        console.error(`[API] /meters/${req.params.id}/consumption error:`, err.message);
        res.status(500).json({ error: err.message, status_code: 500 });
    }
});

/**
 * @swagger
 * /api/v1/transformers:
 *   get:
 *     summary: Retrieve distribution transformers in the electrical network
 *     tags: [Network Topology]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (1-based)
 *     responses:
 *       200:
 *         description: List of distribution transformers
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransformerListResponse'
 *       500:
 *         description: Server error
 */
app.get('/api/v1/transformers', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const result = await portalClient.getTransformers({ page });
        res.json(result);
    } catch (err) {
        console.error('[API] /transformers error:', err.message);
        res.status(500).json({ error: err.message, status_code: 500 });
    }
});

/**
 * @swagger
 * /api/v1/hierarchy:
 *   get:
 *     summary: Retrieve organized network hierarchy tree from Zone down to connected smart meters
 *     tags: [Network Topology]
 *     responses:
 *       200:
 *         description: Full electrical grid hierarchy tree
 *       500:
 *         description: Server error
 */
app.get('/api/v1/hierarchy', async (req, res) => {
    try {
        const hierarchy = await portalClient.getHierarchy();
        res.json(hierarchy);
    } catch (err) {
        console.error('[API] /hierarchy error:', err.message);
        res.status(500).json({ error: err.message, status_code: 500 });
    }
});

/**
 * @swagger
 * /api/v1/export:
 *   get:
 *     summary: Retrieve full dataset of all meters via HMAC-SHA256 signed export
 *     tags: [Meters]
 *     responses:
 *       200:
 *         description: Complete inventory array of all 403 meters with rich topology and coordinates
 *       500:
 *         description: Server error
 */
app.get('/api/v1/export', async (req, res) => {
    try {
        const fullData = await portalClient.getExportAll();
        res.json({
            total: fullData.length,
            meters: fullData
        });
    } catch (err) {
        console.error('[API] /export error:', err.message);
        res.status(500).json({ error: err.message, status_code: 500 });
    }
});

// Start Express Server
const PORT = process.env.PORT || 3001;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`⚡ Flock Energy - Urja Meter Ops API Service Started`);
        console.log(`- Base URL: http://localhost:${PORT}`);
        console.log(`- Interactive Swagger Docs: http://localhost:${PORT}/docs`);
        console.log(`- OpenAPI Specification: http://localhost:${PORT}/openapi.json`);
        console.log(`- Web Client Dashboard: http://localhost:${PORT}/`);
        console.log(`=======================================================`);
    });
}

module.exports = app;
