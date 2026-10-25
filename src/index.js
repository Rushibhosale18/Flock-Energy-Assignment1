const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const requestLogger = require('./middleware/request-logger');
const errorHandler = require('./middleware/error-handler');
const UrjaPortalClient = require('./services/urja-client');
const swaggerSpec = require('./docs/swagger');

// Route Factories
const createAuthRouter = require('./routes/auth.routes');
const createMetersRouter = require('./routes/meters.routes');
const createNetworkRouter = require('./routes/network.routes');
const createSystemRouter = require('./routes/system.routes');

const app = express();

// Standard Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Initialize Upstream Portal Client
const portalClient = new UrjaPortalClient({
    baseUrl: config.portal.baseUrl,
    email: config.portal.email,
    password: config.portal.password,
    timeout: config.portal.timeoutMs
});

// Serve Interactive Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCssUrl: '/swagger-custom.css',
    customSiteTitle: 'Flock Energy - Urja Ops API Docs'
}));

// Serve Raw OpenAPI JSON at root & API path
app.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerSpec);
});

// Serve Frontend Web Dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Mount API Routers
app.use('/api/v1/auth', createAuthRouter(portalClient));
app.use('/api/v1/meters', createMetersRouter(portalClient));
app.use('/api/v1', createNetworkRouter(portalClient));
app.use('/api/v1', createSystemRouter(portalClient, swaggerSpec));

// 404 Fallback for unmapped API routes
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: {
                code: 'ENDPOINT_NOT_FOUND',
                message: `Route ${req.method} ${req.originalUrl} does not exist.`
            },
            meta: {
                request_id: req.id,
                timestamp: new Date().toISOString()
            }
        });
    }
    next();
});

// Centralized Error Handling Middleware
app.use(errorHandler);

// Server Execution
if (require.main === module) {
    const server = app.listen(config.port, () => {
        console.log(`\n=============================================================`);
        console.log(`⚡ FLOCK ENERGY - URJA METER OPS REST API SERVICE`);
        console.log(`-------------------------------------------------------------`);
        console.log(`- Service URL:         http://localhost:${config.port}`);
        console.log(`- Swagger UI Docs:     http://localhost:${config.port}/docs`);
        console.log(`- OpenAPI Schema:      http://localhost:${config.port}/openapi.json`);
        console.log(`- Health Check:        http://localhost:${config.port}/api/v1/health`);
        console.log(`- Web Dashboard:       http://localhost:${config.port}/`);
        console.log(`=============================================================\n`);
    });

    // Graceful Shutdown Handling
    process.on('SIGTERM', () => {
        console.log('[SHUTDOWN] SIGTERM received. Gracefully closing HTTP server...');
        server.close(() => {
            console.log('[SHUTDOWN] HTTP server closed cleanly. Exiting.');
            process.exit(0);
        });
    });
}

module.exports = app;
