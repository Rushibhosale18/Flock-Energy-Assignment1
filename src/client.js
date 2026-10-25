const dns = require('dns');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const crypto = require('crypto');

// Apply DNS fallback for environments (such as NAT64/IPv6 networks) where direct IPv4 to urja-ops times out
const originalLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (hostname === 'urja-ops.flockenergy.tech') {
        if (options && options.all) {
            return callback(null, [
                { address: '64:ff9b::2851:f567', family: 6 },
                { address: '40.81.245.103', family: 4 }
            ]);
        }
        return callback(null, '64:ff9b::2851:f567', 6);
    }
    return originalLookup.call(dns, hostname, options, callback);
};

class UrjaClient {
    /**
     * @param {string} baseURL Base URL of legacy Urja Ops portal
     * @param {string} email Operator login email
     * @param {string} password Operator login password
     */
    constructor(baseURL, email, password) {
        this.baseURL = (baseURL || 'https://urja-ops.flockenergy.tech').replace(/\/+$/, '');
        this.email = email || 'operator@urja.local';
        this.password = password || 'urja-ops-2026';
        this.jar = new CookieJar();

        this.client = wrapper(axios.create({
            jar: this.jar,
            withCredentials: true,
            baseURL: this.baseURL,
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/html, */*',
                'Origin': this.baseURL,
                'Referer': `${this.baseURL}/login`
            }
        }));

        this.authenticated = false;
        this.lastAuthTime = null;
        this.authPromise = null;
    }

    /**
     * Authenticates with the legacy Urja portal.
     * Handles SvelteKit CSRF checks (Origin/Referer) and extracts session cookies.
     */
    async login(force = false) {
        if (!force && this.authenticated && this.lastAuthTime && (Date.now() - this.lastAuthTime < 3000 * 1000)) {
            return true;
        }

        if (this.authPromise) {
            return this.authPromise;
        }

        this.authPromise = (async () => {
            try {
                console.log(`[UrjaClient] Authenticating to ${this.baseURL} as ${this.email}...`);
                const params = new URLSearchParams();
                params.append('email', this.email);
                params.append('password', this.password);

                const res = await this.client.post('/login', params.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin': this.baseURL,
                        'Referer': `${this.baseURL}/login`
                    }
                });

                // SvelteKit returns 200 OK with {"type":"redirect","status":303,"location":"/meters"}
                // and sets __Secure-better-auth.session_token cookie
                if (res.status === 200 || res.status === 302 || res.status === 303) {
                    this.authenticated = true;
                    this.lastAuthTime = Date.now();
                    console.log('[UrjaClient] Authentication successful. Session cookie established.');
                    return true;
                }

                throw new Error(`Authentication returned status ${res.status}: ${JSON.stringify(res.data)}`);
            } catch (err) {
                this.authenticated = false;
                console.error('[UrjaClient] Authentication failure:', err.message);
                throw new Error(`Urja Portal login failed: ${err.message}`);
            } finally {
                this.authPromise = null;
            }
        })();

        return this.authPromise;
    }

    /**
     * Executes an authenticated request with automatic retry and re-authentication on 401/403.
     */
    async request(config) {
        await this.login();
        try {
            return await this.client(config);
        } catch (err) {
            if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                console.warn('[UrjaClient] Session invalid/expired (HTTP ' + err.response.status + '). Re-authenticating...');
                this.authenticated = false;
                await this.login(true);
                return await this.client(config);
            }
            throw err;
        }
    }

    /**
     * Retrieves smart meters with pagination and search.
     * @param {Object} options
     * @param {string} [options.q=''] Search query (meter ID, serial number)
     * @param {number} [options.page=1] Page number (1-based)
     * @param {number} [options.pageSize=20] Items per page
     * @param {boolean} [options.all=false] Return all 403 meters at once
     */
    async getMeters({ q = '', page = 1, pageSize = 20, all = false } = {}) {
        if (all) {
            // Retrieve entire inventory via signed export
            const fullExport = await this.getExportAll();
            return {
                total: fullExport.length,
                page: 1,
                page_size: fullExport.length,
                data: fullExport.map(m => this.normalizeMeter(m))
            };
        }

        const res = await this.request({
            method: 'GET',
            url: `/portal/meters/search?q=${encodeURIComponent(q)}&page=${page}`
        });

        const raw = res.data;
        const normalized = (raw.data || []).map(m => this.normalizeMeter(m));

        return {
            total: raw.total || normalized.length,
            page: raw.page || page,
            page_size: raw.pageSize || pageSize,
            total_pages: Math.max(1, Math.ceil((raw.total || normalized.length) / (raw.pageSize || 20))),
            data: normalized
        };
    }

    /**
     * Retrieves specific meter details combining:
     * 1. SSR HTML nameplate & breadcrumb hierarchy (/meters/{id})
     * 2. Internal geo coordinate API (/portal/meters/{id}/geo)
     * 3. SvelteKit embedded JSON hydration state
     */
    async getMeterDetails(meterId) {
        if (!meterId) throw new Error('meterId is required');

        // Execute concurrent requests: SSR HTML page and internal geo API
        const [htmlRes, geoRes] = await Promise.allSettled([
            this.request({ method: 'GET', url: `/meters/${meterId}` }),
            this.request({ method: 'GET', url: `/portal/meters/${meterId}/geo` })
        ]);

        let htmlData = null;
        if (htmlRes.status === 'fulfilled') {
            htmlData = htmlRes.value.data;
        } else {
            console.warn(`[UrjaClient] Failed to fetch HTML for meter ${meterId}:`, htmlRes.reason.message);
        }

        let geoData = null;
        if (geoRes.status === 'fulfilled' && geoRes.value.data?.data) {
            const rawGeo = geoRes.value.data.data;
            geoData = {
                latitude: rawGeo.latitude ? parseFloat(rawGeo.latitude) : null,
                longitude: rawGeo.longitude ? parseFloat(rawGeo.longitude) : null
            };
        }

        // Parse HTML with Cheerio
        const details = {
            meter_id: meterId,
            serial_number: null,
            make: null,
            phase_type: null,
            install_status: null,
            install_type: null,
            dt_code: null,
            geo: geoData,
            hierarchy: {},
            raw_attributes: {}
        };

        if (htmlData) {
            const $ = cheerio.load(htmlData);

            // 1. Parse Nameplate <dl> definition list
            $('dl div').each((_, el) => {
                const label = $(el).find('dt').text().trim();
                const value = $(el).find('dd').text().trim();
                if (label && value) {
                    details.raw_attributes[label] = value;

                    const lower = label.toLowerCase();
                    if (lower.includes('serial')) details.serial_number = value;
                    else if (lower === 'make') details.make = value;
                    else if (lower.includes('phase')) details.phase_type = value;
                    else if (lower.includes('installation status') || lower === 'status') details.install_status = value;
                    else if (lower.includes('installation type')) details.install_type = value;
                }
            });

            // 2. Parse Breadcrumb Hierarchy Navigation
            const breadcrumbItems = [];
            $('nav.text-xs span, nav.flex-wrap span').each((_, span) => {
                const text = $(span).text().trim();
                if (text && text !== '›' && text !== '>') {
                    breadcrumbItems.push(text);
                }
            });

            if (breadcrumbItems.length > 0) {
                // Typical sequence: Zone › Circle › Division › Subdivision › Sub Station › Feeder › DT
                const hierarchyKeys = ['zone', 'circle', 'division', 'subdivision', 'substation', 'feeder', 'dt'];
                breadcrumbItems.forEach((item, idx) => {
                    if (idx < hierarchyKeys.length) {
                        details.hierarchy[hierarchyKeys[idx]] = item;
                    }
                });
            }

            // 3. Fallback / Enhancement: Extract SvelteKit hydration script data if present
            try {
                const scriptMatch = htmlData.match(/kit\.start\(app,\s*element,\s*(\{.*?\})\s*\);/s);
                if (scriptMatch && scriptMatch[1]) {
                    // Try to extract meter details and hierarchy from the script text
                    const scriptText = scriptMatch[1];
                    const hierMatch = scriptText.match(/hierarchy:\s*(\{.*?\})/);
                    if (hierMatch) {
                        const parsedHier = this.safeParseLooseJSON(hierMatch[1]);
                        if (parsedHier) {
                            if (parsedHier.Zone) details.hierarchy.zone = parsedHier.Zone;
                            if (parsedHier.Circle) details.hierarchy.circle = parsedHier.Circle;
                            if (parsedHier.Division) details.hierarchy.division = parsedHier.Division;
                            if (parsedHier.Subdivision) details.hierarchy.subdivision = parsedHier.Subdivision;
                            if (parsedHier['Sub Station']) details.hierarchy.substation = parsedHier['Sub Station'];
                            if (parsedHier.Feeder) details.hierarchy.feeder = parsedHier.Feeder;
                            if (parsedHier.DT) {
                                details.hierarchy.dt = parsedHier.DT;
                                const dtCodeMatch = parsedHier.DT.match(/\((DT-\d+)\)/);
                                if (dtCodeMatch) details.dt_code = dtCodeMatch[1];
                            }
                        }
                    }
                }
            } catch (e) {
                // Silently ignore regex parse errors; DOM parse above provides primary coverage
            }
        }

        // If dt_code was not in breadcrumb text, look in raw attributes or search cache
        if (!details.dt_code && details.hierarchy.dt) {
            const m = details.hierarchy.dt.match(/\((DT-\d+)\)/);
            if (m) details.dt_code = m[1];
        }

        return details;
    }

    /**
     * Retrieves consumption history for a given smart meter.
     * Cleans stringified floats, parses timestamps, normalizes data, and computes analytics summary.
     */
    async getMeterConsumption(meterId) {
        if (!meterId) throw new Error('meterId is required');

        const res = await this.request({
            method: 'GET',
            url: `/portal/meters/${meterId}/energy`
        });

        const rawList = res.data?.data || [];

        // Normalize readings
        const readings = rawList.map(item => {
            const kwh = item.kwh !== undefined && item.kwh !== null && item.kwh !== '—'
                ? parseFloat(item.kwh)
                : null;
            const kvah = item.kvah !== undefined && item.kvah !== null && item.kvah !== '—'
                ? parseFloat(item.kvah)
                : null;
            const voltR = item.voltR !== undefined && item.voltR !== null && item.voltR !== '—'
                ? parseFloat(item.voltR)
                : null;

            // Normalize timestamp "DD/MM/YYYY HH:mm" to ISO 8601
            let isoTimestamp = null;
            if (item.timestamp) {
                const parts = item.timestamp.split(' ');
                if (parts.length === 2) {
                    const dateParts = parts[0].split('/');
                    if (dateParts.length === 3) {
                        const [day, month, year] = dateParts;
                        isoTimestamp = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${parts[1]}:00Z`;
                    }
                }
            }

            return {
                timestamp: isoTimestamp || item.timestamp,
                raw_timestamp: item.timestamp,
                kwh: kwh,
                kvah: kvah,
                voltage_r: voltR
            };
        });

        // Compute summary metrics
        let totalKwh = 0;
        let validKwhCount = 0;
        let totalVolt = 0;
        let validVoltCount = 0;

        readings.forEach(r => {
            if (r.kwh !== null) {
                totalKwh += r.kwh;
                validKwhCount++;
            }
            if (r.voltage_r !== null) {
                totalVolt += r.voltage_r;
                validVoltCount++;
            }
        });

        const firstReading = readings[0] || null;
        const lastReading = readings[readings.length - 1] || null;

        return {
            meter_id: meterId,
            total_readings: readings.length,
            time_window: {
                start: firstReading?.timestamp || null,
                end: lastReading?.timestamp || null
            },
            summary: {
                latest_kwh: lastReading?.kwh ?? null,
                latest_kvah: lastReading?.kvah ?? null,
                latest_voltage_r: lastReading?.voltage_r ?? null,
                average_voltage_r: validVoltCount > 0 ? parseFloat((totalVolt / validVoltCount).toFixed(2)) : null
            },
            readings: readings
        };
    }

    /**
     * Retrieves distribution transformers with pagination.
     */
    async getTransformers({ page = 1 } = {}) {
        const res = await this.request({
            method: 'GET',
            url: `/portal/dts?page=${page}`
        });

        const raw = res.data;
        const data = (raw.data || []).map(dt => ({
            code: dt.code,
            name: dt.name,
            feeder_code: dt.feederCode,
            capacity_kva: typeof dt.capacityKva === 'string' ? parseFloat(dt.capacityKva) : dt.capacityKva
        }));

        return {
            total: raw.total || data.length,
            page: raw.page || page,
            page_size: raw.pageSize || 20,
            total_pages: Math.max(1, Math.ceil((raw.total || data.length) / (raw.pageSize || 20))),
            data: data
        };
    }

    /**
     * Generates HMAC-SHA256 signature and fetches the full export payload.
     * Signs [method, path, queryString, timestamp].join('\n') using signingSecret from /portal/keys.
     */
    async getExportAll() {
        const keyRes = await this.request({ method: 'GET', url: '/portal/keys' });
        const secret = keyRes.data?.data?.signingSecret;
        if (!secret) throw new Error('Unable to obtain signing secret from /portal/keys');

        const timestamp = String(Math.floor(Date.now() / 1000));
        const method = 'GET';
        const path = '/portal/export';
        const query = 'page=1';
        const message = [method, path, query, timestamp].join('\n');
        const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

        const expRes = await this.request({
            method: 'GET',
            url: `${path}?${query}`,
            headers: {
                'x-timestamp': timestamp,
                'x-signature': signature
            }
        });

        return expRes.data?.data || [];
    }

    /**
     * Constructs a hierarchical network tree:
     * Zone -> Circle -> Division -> Subdivision -> Substation -> Feeder -> DT -> Meters
     */
    async getHierarchy() {
        const allMeters = await this.getExportAll();
        const dtsRes = await this.getTransformers({ page: 1 });
        const allDts = dtsRes.data;

        const hierarchyTree = {};

        allMeters.forEach(m => {
            const h = m.hierarchy || {};
            const zoneCode = h.zone?.code || 'Z-01';
            const zoneName = h.zone?.name || 'Jaipur Zone 1';

            const circleCode = h.circle?.code || 'C-01';
            const circleName = h.circle?.name || 'Circle 1';

            const divCode = h.division?.code || 'D-01';
            const divName = h.division?.name || 'Division 1';

            const subDivCode = h.subdivision?.code || 'SD-01';
            const subDivName = h.subdivision?.name || 'Subdivision 1';

            const ssCode = h.substation?.code || 'SS-01';
            const ssName = h.substation?.name || 'Substation 1';

            const fCode = h.feeder?.code || 'F-001';
            const fName = h.feeder?.name || 'Feeder 1';

            const dtCode = h.dt?.code || m.dtCode || 'DT-001';
            const dtName = h.dt?.name || 'DT ' + dtCode;

            // Build tree nodes
            if (!hierarchyTree[zoneCode]) {
                hierarchyTree[zoneCode] = { code: zoneCode, name: zoneName, circles: {} };
            }
            const z = hierarchyTree[zoneCode];

            if (!z.circles[circleCode]) {
                z.circles[circleCode] = { code: circleCode, name: circleName, divisions: {} };
            }
            const c = z.circles[circleCode];

            if (!c.divisions[divCode]) {
                c.divisions[divCode] = { code: divCode, name: divName, subdivisions: {} };
            }
            const d = c.divisions[divCode];

            if (!d.subdivisions[subDivCode]) {
                d.subdivisions[subDivCode] = { code: subDivCode, name: subDivName, substations: {} };
            }
            const sd = d.subdivisions[subDivCode];

            if (!sd.substations[ssCode]) {
                sd.substations[ssCode] = { code: ssCode, name: ssName, feeders: {} };
            }
            const ss = sd.substations[ssCode];

            if (!ss.feeders[fCode]) {
                ss.feeders[fCode] = { code: fCode, name: fName, distribution_transformers: {} };
            }
            const f = ss.feeders[fCode];

            if (!f.distribution_transformers[dtCode]) {
                const dtMeta = allDts.find(d => d.code === dtCode);
                f.distribution_transformers[dtCode] = {
                    code: dtCode,
                    name: dtName,
                    capacity_kva: dtMeta ? dtMeta.capacity_kva : null,
                    meters: []
                };
            }

            f.distribution_transformers[dtCode].meters.push({
                meter_id: m.meterId,
                serial_number: m.serialNo,
                make: m.make,
                phase_type: m.phaseType,
                install_status: m.installStatus,
                geo: m.geo ? { latitude: m.geo.lat, longitude: m.geo.lng } : null
            });
        });

        // Convert object maps to arrays for clean JSON consumption
        return Object.values(hierarchyTree).map(z => ({
            code: z.code,
            name: z.name,
            circles: Object.values(z.circles).map(c => ({
                code: c.code,
                name: c.name,
                divisions: Object.values(c.divisions).map(d => ({
                    code: d.code,
                    name: d.name,
                    subdivisions: Object.values(d.subdivisions).map(sd => ({
                        code: sd.code,
                        name: sd.name,
                        substations: Object.values(sd.substations).map(ss => ({
                            code: ss.code,
                            name: ss.name,
                            feeders: Object.values(ss.feeders).map(f => ({
                                code: f.code,
                                name: f.name,
                                distribution_transformers: Object.values(f.distribution_transformers)
                            }))
                        }))
                    }))
                }))
            }))
        }));
    }

    /**
     * Standardizes meter object fields from portal responses.
     */
    normalizeMeter(raw) {
        return {
            meter_id: raw.meterId || raw.id,
            serial_number: raw.serialNo || raw.serial,
            make: raw.make,
            phase_type: raw.phaseType || raw.phase,
            install_status: raw.installStatus || raw.status,
            install_type: raw.installType || raw.installationType || null,
            dt_code: raw.dtCode || raw.dt,
            geo: raw.geo ? {
                latitude: raw.geo.lat ?? (raw.geo.latitude ? parseFloat(raw.geo.latitude) : null),
                longitude: raw.geo.lng ?? (raw.geo.longitude ? parseFloat(raw.geo.longitude) : null)
            } : null,
            hierarchy: raw.hierarchy || null
        };
    }

    safeParseLooseJSON(str) {
        try {
            return JSON.parse(str);
        } catch {
            try {
                // Handle unquoted keys like {Zone:"Jaipur", ...}
                const formatted = str.replace(/([{,]\s*)([A-Za-z0-9_\s]+)\s*:/g, (match, prefix, key) => {
                    return `${prefix}"${key.trim()}":`;
                });
                return JSON.parse(formatted);
            } catch {
                return null;
            }
        }
    }
}

module.exports = UrjaClient;
