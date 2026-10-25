const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const app = require('../src/index');

test('REST API - Integration Test Suite', async (t) => {
    let server;
    let baseUrl;

    await t.test('Start ephemeral test server', async () => {
        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://localhost:${port}`;
                resolve();
            });
        });
    });

    await t.test('GET /api/v1/health should return system status', async () => {
        const res = await axios.get(`${baseUrl}/api/v1/health`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.status, 'healthy');
        assert.strictEqual(res.data.service, 'flock-energy-api');
    });

    await t.test('POST /api/v1/auth/login should authenticate session', async () => {
        const res = await axios.post(`${baseUrl}/api/v1/auth/login`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.success, true);
        assert.strictEqual(res.data.data.status, 'authenticated');
    });

    await t.test('GET /api/v1/meters should return meters list', async () => {
        const res = await axios.get(`${baseUrl}/api/v1/meters?page=1&pageSize=3`);
        assert.strictEqual(res.status, 200);
        assert.ok(res.data.total >= 400);
        assert.ok(res.data.data.length > 0);
        assert.ok(res.data.data[0].meter_id);
    });

    await t.test('GET /api/v1/meters/:id should return single meter details', async () => {
        const res = await axios.get(`${baseUrl}/api/v1/meters/J100000`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.meter_id, 'J100000');
        assert.strictEqual(res.data.serial_number, 'SE33962');
        assert.ok(res.data.geo);
    });

    await t.test('GET /api/v1/meters/:id/consumption should return interval telemetry', async () => {
        const res = await axios.get(`${baseUrl}/api/v1/meters/J100000/consumption`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.meter_id, 'J100000');
        assert.ok(res.data.total_readings > 0);
        assert.strictEqual(typeof res.data.readings[0].kwh, 'number');
    });

    await t.test('GET /api/v1/transformers should return DTs', async () => {
        const res = await axios.get(`${baseUrl}/api/v1/transformers?page=1`);
        assert.strictEqual(res.status, 200);
        assert.ok(res.data.total >= 40);
        assert.ok(res.data.data.length > 0);
    });

    await t.test('GET /api/v1/hierarchy should assemble network tree', async () => {
        const res = await axios.get(`${baseUrl}/api/v1/hierarchy`);
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data));
        assert.ok(res.data.length > 0);
        assert.ok(res.data[0].circles);
    });

    await t.test('GET /openapi.json should return valid OpenAPI 3.0 document', async () => {
        const res = await axios.get(`${baseUrl}/openapi.json`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.openapi, '3.0.0');
        assert.ok(res.data.paths['/api/v1/meters']);
    });

    await t.test('GET /api/unknown-route should return structured 404', async () => {
        try {
            await axios.get(`${baseUrl}/api/unknown-route`);
            assert.fail('Should have responded with 404');
        } catch (err) {
            assert.strictEqual(err.response.status, 404);
            assert.strictEqual(err.response.data.success, false);
            assert.strictEqual(err.response.data.error.code, 'ENDPOINT_NOT_FOUND');
        }
    });

    await t.test('Close test server', async () => {
        await new Promise((resolve) => server.close(resolve));
    });
});
