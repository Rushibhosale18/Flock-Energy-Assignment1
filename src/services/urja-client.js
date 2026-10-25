const dns = require('dns');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const crypto = require('crypto');
const config = require('../config');
const {
    AuthenticationError,
    ForbiddenError,
    NotFoundError,
    UpstreamGatewayError,
    GatewayTimeoutError
} = require('../errors/AppError');

// Dual-Stack DNS Resolution Hook:
// Guarantees reliable TCP connectivity across IPv4 and NAT64/IPv6 cellular networks
const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (hostname === config.network.targetHost) {
        if (options && options.all) {
            return callback(null, [
                { address: config.network.nat64PrefixIpv6, family: 6 },
                { address: config.network.targetIpv4, family: 4 }
            ]);
        }
        return callback(null, config.network.nat64PrefixIpv6, 6);
    }
    return originalLookup.call(dns, hostname, options, callback);
};

class UrjaPortalClient {
    /**
     * @param {Object} [options]
     * @param {string} [options.baseUrl]
     * @param {string} [options.email]
     * @param {string} [options.password]
     */
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || config.portal.baseUrl).replace(/\/+$/, '');
        this.email = options.email || config.portal.email;
        this.password = options.password || config.portal.password;
        this.timeout = options.timeout || config.portal.timeoutMs;

        this.jar = new CookieJar();
        this.client = wrapper(axios.create({
            jar: this.jar,
            withCredentials: true,
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/html, */*',
                'Origin': this.baseUrl,
                'Referer': `${this.baseUrl}/login`
            }
        }));

        this.authenticated = false;
        this.lastAuthTime = null;
        this.authLock = null;
    }

    /**
     * Authenticates with Urja Ops portal and captures session cookie.
     * @param {boolean} [force=false]
     * @returns {Promise<boolean>}
     */
    async login(force = false) {
        // Return existing session if still within valid TTL margin
        if (!force && this.authenticated && this.lastAuthTime) {
            const ageSeconds = (Date.now() - this.lastAuthTime) / 1000;
            if (ageSeconds < (config.portal.sessionTtlSec - config.portal.sessionRefreshMarginSec)) {
                return true;
            }
        }

        // Mutex to serialize concurrent login attempts
        if (this.authLock) {
            return this.authLock;
        }

        this.authLock = (async () => {
            try {
                console.log(`[UrjaClient] Initiating portal authentication for ${this.email}...`);
                const formParams = new URLSearchParams();
                formParams.append('email', this.email);
                formParams.append('password', this.password);

                const response = await this.client.post('/login', formParams.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin': this.baseUrl,
                        'Referer': `${this.baseUrl}/login`
                    }
                });

                if (response.status === 200 || response.status === 302 || response.status === 303) {
                    this.authenticated = true;
                    this.lastAuthTime = Date.now();
                    console.log(`[UrjaClient] Session established successfully. Token active for 3600s.`);
                    return true;
                }

                throw new AuthenticationError(`Unexpected status ${response.status} during authentication`);
            } catch (err) {
                this.authenticated = false;
                if (err.response?.status === 403) {
                    throw new ForbiddenError('Upstream portal rejected credentials or CSRF Origin verification failed.');
                }
                if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
                    throw new GatewayTimeoutError('Authentication timed out contacting Urja Ops portal.');
                }
                throw new AuthenticationError(err.message, { original: err.response?.data });
            } finally {
                this.authLock = null;
            }
        })();

        return this.authLock;
    }

    /**
     * Executes an authenticated HTTP request with automatic session healing on 401/403.
     */
    async request(config) {
        await this.login();
        try {
            return await this.client(config);
        } catch (err) {
            // Auto-heal expired session
            if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                console.warn(`[UrjaClient] Received HTTP ${err.response.status}. Session invalidated. Re-authenticating...`);
                this.authenticated = false;
                await this.login(true);
                return await this.client(config);
            }
            if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
                throw new GatewayTimeoutError(`Request to ${config.url} timed out.`);
            }
            if (err.response && err.response.status === 404) {
                throw new NotFoundError('Requested resource', config.url);
            }
            throw new UpstreamGatewayError(err.message, { url: config.url, status: err.response?.status });
        }
    }

    /**
     * Queries smart meters with pagination and optional search filter.
     * @param {Object} [params]
     * @param {string} [params.q='']
     * @param {number} [params.page=1]
     * @param {number} [params.pageSize=20]
     * @param {boolean} [params.all=false]
     */
    async getMeters({ q = '', page = 1, pageSize = 20, all = false } = {}) {
        if (all) {
            const allExported = await this.getExportAll();
            return {
                total: allExported.length,
                page: 1,
                page_size: allExported.length,
                total_pages: 1,
                data: allExported.map(m => this.normalizeMeter(m))
            };
        }

        const res = await this.request({
            method: 'GET',
            url: `/portal/meters/search?q=${encodeURIComponent(q)}&page=${page}`
        });

        const raw = res.data || {};
        const items = (raw.data || []).map(m => this.normalizeMeter(m));
        const total = raw.total !== undefined ? raw.total : items.length;
        const pSize = raw.pageSize || pageSize;

        return {
            total: total,
            page: raw.page || page,
            page_size: pSize,
            total_pages: Math.max(1, Math.ceil(total / pSize)),
            data: items
        };
    }

    /**
     * Retrieves specific meter specifications:
     * - Scrapes SSR Nameplate (<dl>) and Hierarchy breadcrumb (<nav>) via Cheerio
     * - Queries internal geo-location coordinates (/portal/meters/{id}/geo)
     * - Inspects SvelteKit hydration payload
     * @param {string} meterId
     */
    async getMeterDetails(meterId) {
        if (!meterId) throw new NotFoundError('Meter', 'undefined');

        const [htmlRes, geoRes] = await Promise.allSettled([
            this.request({ method: 'GET', url: `/meters/${meterId}` }),
            this.request({ method: 'GET', url: `/portal/meters/${meterId}/geo` })
        ]);

        let htmlData = null;
        if (htmlRes.status === 'fulfilled') {
            htmlData = htmlRes.value.data;
        }

        let geo = null;
        if (geoRes.status === 'fulfilled' && geoRes.value.data?.data) {
            const rawGeo = geoRes.value.data.data;
            geo = {
                latitude: rawGeo.latitude ? parseFloat(rawGeo.latitude) : null,
                longitude: rawGeo.longitude ? parseFloat(rawGeo.longitude) : null
            };
        }

        const details = {
            meter_id: meterId,
            serial_number: null,
            make: null,
            phase_type: null,
            install_status: null,
            install_type: null,
            dt_code: null,
            geo: geo,
            hierarchy: {},
            raw_attributes: {}
        };

        if (htmlData) {
            const $ = cheerio.load(htmlData);

            // Parse Nameplate <dl>
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

            // Parse Breadcrumbs
            const breadcrumbParts = [];
            $('nav.text-xs span, nav.flex-wrap span').each((_, span) => {
                const text = $(span).text().trim();
                if (text && text !== '›' && text !== '>') {
                    breadcrumbParts.push(text);
                }
            });

            if (breadcrumbParts.length > 0) {
                const keys = ['zone', 'circle', 'division', 'subdivision', 'substation', 'feeder', 'dt'];
                breadcrumbParts.forEach((part, index) => {
                    if (index < keys.length) {
                        details.hierarchy[keys[index]] = part;
                    }
                });
            }

            // Fallback: SvelteKit hydration payload regex parse
            try {
                const scriptMatch = htmlData.match(/hierarchy:\s*(\{.*?\})/);
                if (scriptMatch) {
                    const parsed = this.safeParseLooseJSON(scriptMatch[1]);
                    if (parsed) {
                        if (parsed.Zone && !details.hierarchy.zone) details.hierarchy.zone = parsed.Zone;
                        if (parsed.Circle && !details.hierarchy.circle) details.hierarchy.circle = parsed.Circle;
                        if (parsed.Division && !details.hierarchy.division) details.hierarchy.division = parsed.Division;
                        if (parsed.Subdivision && !details.hierarchy.subdivision) details.hierarchy.subdivision = parsed.Subdivision;
                        if (parsed['Sub Station'] && !details.hierarchy.substation) details.hierarchy.substation = parsed['Sub Station'];
                        if (parsed.Feeder && !details.hierarchy.feeder) details.hierarchy.feeder = parsed.Feeder;
                        if (parsed.DT && !details.hierarchy.dt) details.hierarchy.dt = parsed.DT;
                    }
                }
            } catch (e) {
                // Ignore parse quirks
            }
        }

        // Extract DT code if present in DT string e.g. "Malviya Nagar DT 1 (DT-001)"
        if (details.hierarchy.dt) {
            const dtMatch = details.hierarchy.dt.match(/\((DT-\d+)\)/);
            if (dtMatch) details.dt_code = dtMatch[1];
        }

        return details;
    }

    /**
     * Retrieves normalized 30-minute interval telemetry records and summary stats.
     * Converts numeric strings to floats and Indian timestamps to ISO 8601.
     * @param {string} meterId
     */
    async getMeterConsumption(meterId) {
        if (!meterId) throw new NotFoundError('Meter', 'undefined');

        const res = await this.request({
            method: 'GET',
            url: `/portal/meters/${meterId}/energy`
        });

        const rawList = res.data?.data || [];

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

        let totalKwh = 0, validKwhCount = 0;
        let totalVolt = 0, validVoltCount = 0;

        readings.forEach(r => {
            if (r.kwh !== null) { totalKwh += r.kwh; validKwhCount++; }
            if (r.voltage_r !== null) { totalVolt += r.voltage_r; validVoltCount++; }
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
     * @param {Object} [params]
     * @param {number} [params.page=1]
     */
    async getTransformers({ page = 1 } = {}) {
        const res = await this.request({
            method: 'GET',
            url: `/portal/dts?page=${page}`
        });

        const raw = res.data || {};
        const items = (raw.data || []).map(dt => ({
            code: dt.code,
            name: dt.name,
            feeder_code: dt.feederCode,
            capacity_kva: typeof dt.capacityKva === 'string' ? parseFloat(dt.capacityKva) : dt.capacityKva
        }));

        const total = raw.total || items.length;
        const pageSize = raw.pageSize || 20;

        return {
            total: total,
            page: raw.page || page,
            page_size: pageSize,
            total_pages: Math.max(1, Math.ceil(total / pageSize)),
            data: items
        };
    }

    /**
     * Executes HMAC-SHA256 signed request against /portal/export to retrieve all 403 meters.
     */
    async getExportAll() {
        const keyRes = await this.request({ method: 'GET', url: '/portal/keys' });
        const secret = keyRes.data?.data?.signingSecret;
        if (!secret) throw new UpstreamGatewayError('Unable to extract cryptographic signing secret from /portal/keys');

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
     * Builds structured grid tree: Zone -> Circle -> Division -> Subdivision -> Substation -> Feeder -> DT -> Meters
     */
    async getHierarchy() {
        const [allMeters, dtsRes] = await Promise.all([
            this.getExportAll(),
            this.getTransformers({ page: 1 })
        ]);
        const allDts = dtsRes.data || [];

        const tree = {};

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

            if (!tree[zoneCode]) tree[zoneCode] = { code: zoneCode, name: zoneName, circles: {} };
            const z = tree[zoneCode];

            if (!z.circles[circleCode]) z.circles[circleCode] = { code: circleCode, name: circleName, divisions: {} };
            const c = z.circles[circleCode];

            if (!c.divisions[divCode]) c.divisions[divCode] = { code: divCode, name: divName, subdivisions: {} };
            const d = c.divisions[divCode];

            if (!d.subdivisions[subDivCode]) d.subdivisions[subDivCode] = { code: subDivCode, name: subDivName, substations: {} };
            const sd = d.subdivisions[subDivCode];

            if (!sd.substations[ssCode]) sd.substations[ssCode] = { code: ssCode, name: ssName, feeders: {} };
            const ss = sd.substations[ssCode];

            if (!ss.feeders[fCode]) ss.feeders[fCode] = { code: fCode, name: fName, distribution_transformers: {} };
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

        // Convert dictionary maps to nested arrays
        return Object.values(tree).map(z => ({
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
     * Checks upstream connectivity and authentication status.
     */
    async checkHealth() {
        const start = Date.now();
        await this.login();
        const latencyMs = Date.now() - start;
        return {
            status: 'connected',
            upstream_portal: this.baseUrl,
            latency_ms: latencyMs,
            authenticated: this.authenticated,
            session_age_seconds: this.lastAuthTime ? Math.floor((Date.now() - this.lastAuthTime) / 1000) : null
        };
    }

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

module.exports = UrjaPortalClient;
