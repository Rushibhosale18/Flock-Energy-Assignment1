const test = require('node:test');
const assert = require('node:assert');
const UrjaPortalClient = require('../src/services/urja-client');

test('UrjaPortalClient - Unit & Normalization Suite', async (t) => {
    const client = new UrjaPortalClient({
        baseUrl: 'https://urja-ops.flockenergy.tech',
        email: 'operator@urja.local',
        password: 'urja-ops-2026'
    });

    await t.test('Client should initialize with proper defaults', () => {
        assert.strictEqual(client.baseUrl, 'https://urja-ops.flockenergy.tech');
        assert.strictEqual(client.email, 'operator@urja.local');
        assert.strictEqual(client.authenticated, false);
    });

    await t.test('safeParseLooseJSON should parse unquoted JSON keys', () => {
        const raw = '{Zone:"Jaipur Zone 1",Circle:"Circle 1"}';
        const parsed = client.safeParseLooseJSON(raw);
        assert.ok(parsed);
        assert.strictEqual(parsed.Zone, 'Jaipur Zone 1');
        assert.strictEqual(parsed.Circle, 'Circle 1');
    });

    await t.test('normalizeMeter should standardize raw portal fields', () => {
        const raw = {
            meterId: 'J100000',
            serialNo: 'SE33962',
            make: 'HPL',
            phaseType: 'single',
            installStatus: 'Decommissioned',
            dtCode: 'DT-001',
            geo: { lat: 26.9389, lng: 75.8309 }
        };
        const normalized = client.normalizeMeter(raw);
        assert.strictEqual(normalized.meter_id, 'J100000');
        assert.strictEqual(normalized.serial_number, 'SE33962');
        assert.strictEqual(normalized.make, 'HPL');
        assert.strictEqual(normalized.phase_type, 'single');
        assert.strictEqual(normalized.install_status, 'Decommissioned');
        assert.strictEqual(normalized.dt_code, 'DT-001');
        assert.strictEqual(normalized.geo.latitude, 26.9389);
        assert.strictEqual(normalized.geo.longitude, 75.8309);
    });
});

test('UrjaPortalClient - Live Upstream Integration Suite', async (t) => {
    const client = new UrjaPortalClient();

    await t.test('login() should establish authenticated session', async () => {
        const success = await client.login();
        assert.strictEqual(success, true);
        assert.strictEqual(client.authenticated, true);
        assert.ok(client.lastAuthTime > 0);
    });

    await t.test('getMeters() should fetch paginated meters', async () => {
        const res = await client.getMeters({ page: 1, pageSize: 5 });
        assert.ok(res.total >= 400);
        assert.strictEqual(res.page, 1);
        assert.ok(res.data.length > 0);
        assert.ok(res.data[0].meter_id);
    });

    await t.test('getMeterDetails() should retrieve Nameplate and Geo', async () => {
        const detail = await client.getMeterDetails('J100000');
        assert.strictEqual(detail.meter_id, 'J100000');
        assert.strictEqual(detail.serial_number, 'SE33962');
        assert.strictEqual(detail.make, 'HPL');
        assert.ok(detail.geo.latitude > 0);
        assert.ok(detail.hierarchy.zone);
    });

    await t.test('getMeterConsumption() should parse 30-min readings as numbers', async () => {
        const history = await client.getMeterConsumption('J100000');
        assert.strictEqual(history.meter_id, 'J100000');
        assert.ok(history.total_readings > 100);
        assert.strictEqual(typeof history.readings[0].kwh, 'number');
        assert.strictEqual(typeof history.readings[0].voltage_r, 'number');
        assert.ok(history.summary.average_voltage_r > 200);
    });

    await t.test('getTransformers() should retrieve distribution transformers', async () => {
        const dts = await client.getTransformers({ page: 1 });
        assert.ok(dts.total >= 40);
        assert.ok(dts.data.length > 0);
        assert.strictEqual(dts.data[0].code, 'DT-001');
    });
});
