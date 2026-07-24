const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true, headers: {
    'User-Agent': 'Mozilla/5.0'
}}));
const baseURL = 'https://urja-ops.flockenergy.tech';

async function reconMeters() {
    console.log("Logging in...");
    await client.post(`${baseURL}/login`, new URLSearchParams({ email: 'operator@urja.local', password: 'urja-ops-2026' }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    console.log("Fetching /meters...");
    let res = await client.get(`${baseURL}/meters`);
    let html = res.data;
    
    console.log("Looking for internal APIs in script tags...");
    let $ = cheerio.load(html);
    $('script').each((i, el) => {
        let text = $(el).html();
        if (text && (text.includes('fetch') || text.includes('api') || text.includes('XMLHttpRequest'))) {
            console.log(`Script tag ${i} content:\n`, text.substring(0, 500));
        }
    });
    
    // Look for data- attributes or next.js/nuxt/svelte hydrated state
    let nextData = $('#__NEXT_DATA__').html();
    if (nextData) console.log("Found __NEXT_DATA__!");
    let svelteData = $('script[type="svelte-data"]').html() || html.includes('__svelte');
    if (svelteData) console.log("Found Svelte data!");
    
    console.log("Look for JSON in the HTML...");
    if (html.includes('{"meters"')) {
        console.log("Found JSON with 'meters' in HTML!");
    }
    
    // Just to be sure, let's call /api/v1/meters directly
    try {
        console.log("Calling /api/v1/meters directly...");
        let apiRes = await client.get(`${baseURL}/api/v1/meters`);
        console.log("API Status:", apiRes.status);
        if (apiRes.headers['content-type'] && apiRes.headers['content-type'].includes('json')) {
            console.log("API returned JSON:", apiRes.data);
        }
    } catch (err) {
        console.log("API call failed:", err.response ? err.response.status : err.message);
    }
    try {
        console.log("Calling /api/meters directly...");
        let apiRes = await client.get(`${baseURL}/api/meters`);
        console.log("API Status:", apiRes.status);
        if (apiRes.headers['content-type'] && apiRes.headers['content-type'].includes('json')) {
            console.log("API returned JSON:", apiRes.data);
        }
    } catch (err) {
        console.log("API call failed:", err.response ? err.response.status : err.message);
    }
}

reconMeters().catch(console.error);
