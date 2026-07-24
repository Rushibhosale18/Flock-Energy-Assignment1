const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

class UrjaClient {
    constructor(baseURL, email, password) {
        this.baseURL = baseURL;
        this.email = email;
        this.password = password;
        this.jar = new CookieJar();
        this.client = wrapper(axios.create({
            jar: this.jar,
            withCredentials: true,
            maxRedirects: 0,
            validateStatus: () => true, // don't throw on 30x or 4xx
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Origin': baseURL,
                'Referer': `${baseURL}/login`
            }
        }));
        this.authenticated = false;
    }

    async ensureAuthenticated() {
        if (this.authenticated) return;
        
        console.log(`[UrjaClient] Authenticating as ${this.email}...`);
        const params = new URLSearchParams();
        params.append('email', this.email);
        params.append('password', this.password);

        const res = await this.client.post(`${this.baseURL}/login`, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // 303 Redirect to /meters is expected on success
        if (res.status === 303 || res.status === 302) {
            this.authenticated = true;
            console.log("[UrjaClient] Authentication successful.");
        } else {
            const errorMsg = typeof res.data === 'string' ? res.data.substring(0, 100) : JSON.stringify(res.data);
            throw new Error(`Authentication failed with status ${res.status}: ${errorMsg}`);
        }
    }

    async fetchPage(path) {
        await this.ensureAuthenticated();
        
        let res = await this.client.get(`${this.baseURL}${path}`);
        if (res.status === 401 || res.status === 403 || res.request?.res?.responseUrl?.includes('/login')) {
            // Session might have expired
            this.authenticated = false;
            await this.ensureAuthenticated();
            res = await this.client.get(`${this.baseURL}${path}`);
        }

        if (res.status !== 200) {
            throw new Error(`Failed to fetch ${path}, status: ${res.status}`);
        }
        return cheerio.load(res.data);
    }

    async getMeters() {
        const $ = await this.fetchPage('/meters');
        const meters = [];

        // Look for the table rows
        const rows = $('table tbody tr');
        rows.each((i, row) => {
            const cols = $(row).find('td');
            if (cols.length === 1 && $(cols[0]).text().includes('No meters found')) {
                return; // Empty table
            }
            if (cols.length >= 6) {
                const meterIdRaw = $(cols[0]).text().trim();
                const meterLink = $(cols[0]).find('a').attr('href') || `/meters/${meterIdRaw}`;
                const meterId = meterLink.split('/').pop();

                meters.push({
                    id: meterId,
                    meter: meterIdRaw,
                    serial: $(cols[1]).text().trim(),
                    make: $(cols[2]).text().trim(),
                    phase: $(cols[3]).text().trim(),
                    status: $(cols[4]).text().trim(),
                    dt: $(cols[5]).text().trim()
                });
            }
        });

        return meters;
    }

    async getMeterDetails(id) {
        const $ = await this.fetchPage(`/meters/${id}`);
        const details = {
            id: id,
            serial: $('#meter-serial').text().trim() || $('[class*="serial"]').text().trim(),
            status: $('.status-value').text().trim() || $('[class*="status"]').text().trim(),
        };

        // Generic fallback: grab any row-like data
        $('dl div, .grid div').each((i, el) => {
            const label = $(el).find('dt, label, .text-slate-500').text().trim();
            const value = $(el).find('dd, .font-medium').text().trim();
            if (label && value) {
                let key = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
                details[key] = value;
            }
        });
        
        return details;
    }

    async getMeterConsumption(id) {
        const $ = await this.fetchPage(`/meters/${id}/consumption`);
        const records = [];

        $('table tbody tr').each((i, row) => {
            const cols = $(row).find('td');
            if (cols.length > 0) {
                let record = {};
                // Attempt to map dynamically
                const headers = $('table thead th').map((j, th) => $(th).text().trim().toLowerCase().replace(/[^a-z0-9]/g, '_')).get();
                if (headers.length > 0 && headers.length === cols.length) {
                    cols.each((j, col) => {
                        let text = $(col).text().trim();
                        // Convert numeric strings if possible
                        if (/^[0-9]+(\.[0-9]+)?$/.test(text)) {
                            text = parseFloat(text);
                        }
                        record[headers[j]] = text;
                    });
                } else {
                    record = { rawData: $(row).text().replace(/\s+/g, ' ').trim() };
                }
                records.push(record);
            }
        });

        return records;
    }
    
    async getHierarchy() {
        const $ = await this.fetchPage(`/transformers`);
        const transformers = [];

        $('table tbody tr').each((i, row) => {
            const cols = $(row).find('td');
            if (cols.length > 0) {
                if (cols.length === 1 && $(cols[0]).text().includes('No transformers found')) {
                    return; 
                }
                
                const rawName = $(cols[0]).text().trim();
                transformers.push({
                    name: rawName,
                    id: $(cols[0]).find('a').attr('href')?.split('/').pop() || rawName,
                    location: $(cols[1]).text().trim() || 'Unknown',
                    capacity: $(cols[2]).text().trim() || 'Unknown'
                });
            }
        });
        
        return transformers;
    }
}

module.exports = UrjaClient;
