const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true, validateStatus: ()=>true, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/json', 'Origin': 'https://urja-ops.flockenergy.tech', 'Referer': 'https://urja-ops.flockenergy.tech/login' } }));
const baseURL = 'https://urja-ops.flockenergy.tech';
async function test() {
    await client.post(baseURL + '/login', 'email=operator%40urja.local&password=urja-ops-2026', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const paths = ['/export', '/download', '/bulk', '/api/export', '/api/v1/meters/export', '/reports', '/dashboard', '/api/meters/bulk'];
    for (let p of paths) {
        let r = await client.get(baseURL + p);
        console.log(p, r.status);
    }
}
test().catch(console.error);
