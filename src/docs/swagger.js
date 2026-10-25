const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Flock Energy - Urja Meter Ops API',
        version: '1.0.0',
        description: `
## Enterprise REST API Wrapper for Urja Meter Ops
This service automates authentication against SvelteKit session endpoints, manages CSRF constraints, queries internal grid telemetry APIs, scrapes SSR Nameplate specifications via Cheerio, normalizes inconsistent data types into clean JSON, and exposes documented REST endpoints for downstream clients.

### Key Capabilities
- **Automated Session Lifecycle**: Automatic session establishment, 3600s TTL tracking, and auto-healing on HTTP 401/403.
- **Dual-Stack DNS Resilience**: Fallback resolution for NAT64/IPv6 networks.
- **Full Inventory Telemetry**: Real-time paginated access to all 403 smart meters across Jaipur's electrical grid.
- **Clean Time-Series Coercion**: 30-minute interval readings normalized from string floats into native IEEE 754 numbers and ISO 8601 timestamps.
- **Grid Network Topology**: Hierarchical aggregation of Zones, Circles, Divisions, Subdivisions, Substations, Feeders, and Distribution Transformers (DTs).
        `,
        contact: {
            name: 'Flock Energy Platform Engineering',
            email: 'engineering@flockenergy.tech'
        },
        license: {
            name: 'Proprietary',
            url: 'https://flockenergy.tech'
        }
    },
    servers: [
        {
            url: `http://localhost:${config.port}`,
            description: 'Local Gateway'
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
                    success: { type: 'boolean', example: true },
                    data: {
                        type: 'object',
                        properties: {
                            status: { type: 'string', example: 'authenticated' },
                            authenticated_at: { type: 'string', format: 'date-time' },
                            operator: { type: 'string', example: 'operator@urja.local' },
                            session_expires_in_seconds: { type: 'integer', example: 3600 }
                        }
                    },
                    meta: {
                        type: 'object',
                        properties: {
                            request_id: { type: 'string', example: 'c52d43e1-7e82-411a-bf41-6c4b6e5e9b88' },
                            timestamp: { type: 'string', format: 'date-time' }
                        }
                    }
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
                    success: { type: 'boolean', example: false },
                    error: {
                        type: 'object',
                        properties: {
                            code: { type: 'string', example: 'NOT_FOUND' },
                            message: { type: 'string', example: 'Meter J999999 was not found.' },
                            details: { type: 'object', nullable: true }
                        }
                    },
                    meta: {
                        type: 'object',
                        properties: {
                            request_id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
                            timestamp: { type: 'string', format: 'date-time' }
                        }
                    }
                }
            }
        }
    }
};

const routesPattern = path.join(__dirname, '..', 'routes', '*.js').split(path.sep).join('/');

const swaggerOptions = {
    swaggerDefinition,
    apis: ['./src/routes/*.js', routesPattern]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Persist openapi.json to repo root
try {
    const rootPath = path.join(__dirname, '..', '..', 'openapi.json');
    fs.writeFileSync(rootPath, JSON.stringify(swaggerSpec, null, 2), 'utf8');
} catch (e) {
    console.warn('[Swagger] Warning writing openapi.json:', e.message);
}

module.exports = swaggerSpec;
