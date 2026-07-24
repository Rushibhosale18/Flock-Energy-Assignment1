const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const jar = new CookieJar();
const client = wrapper(axios.create({ 
    jar, 
    withCredentials: true, 
    maxRedirects: 0, 
    validateStatus: () => true,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Origin': 'https://urja-ops.flockenergy.tech',
        'Referer': 'https://urja-ops.flockenergy.tech/login'
    }
}));

const baseURL = 'https://urja-ops.flockenergy.tech';

async function recon() {
    console.log("--- GET /login ---");
    let res = await client.get(`${baseURL}/login`);
    console.log(`Status Code: ${res.status}`);
    
    let cookies = await jar.getCookies(baseURL);
    console.log(`Cookies:`, cookies.map(c => `${c.key}=${c.value}`).join('; '));
    
    let $ = cheerio.load(res.data);
    let form = $('form');
    let loginData = {
        email: "operator@urja.local", // using email instead of username
        password: "urja-ops-2026"
    };
    
    if (form.length > 0) {
        console.log("Form inputs:");
        form.find('input').each((i, el) => {
            console.log(`  Input: ${$(el).attr('name')} (type: ${$(el).attr('type')}, value: ${$(el).attr('value')})`);
            if ($(el).attr('type') === 'hidden' && $(el).attr('name')) {
                loginData[$(el).attr('name')] = $(el).attr('value') || '';
            }
        });
        
        // Also look for meta tags for CSRF
        let csrfMeta = $('meta[name="csrf-token"]').attr('content');
        if (csrfMeta) {
            console.log(`Found CSRF in meta tag: ${csrfMeta}`);
            loginData['_csrf'] = csrfMeta; // some frameworks use this
        }

        console.log("\n--- Attempting Login ---");
        const params = new URLSearchParams();
        for (const key in loginData) {
            params.append(key, loginData[key]);
        }
        
        console.log("Payload:", params.toString());
        
        res = await client.post(`${baseURL}/login`, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        console.log(`Status Code: ${res.status}`);
        console.log("Headers:", res.headers);
        console.log("Response Body (first 500 chars):", res.data.substring(0, 500));
        
        if (res.status === 302 || res.status === 303) {
            let redirectUrl = res.headers.location;
            console.log(`\n--- Follow Redirect to ${redirectUrl} ---`);
            const fullUrl = redirectUrl.startsWith('/') ? `${baseURL}${redirectUrl}` : redirectUrl;
            res = await client.get(fullUrl);
            console.log(`Status Code: ${res.status}`);
            
            $ = cheerio.load(res.data);
            
            console.log("\n--- Let's find links to meters ---");
            $('a').each((i, el) => {
                if ($(el).attr('href') && $(el).attr('href').includes('meter')) {
                    console.log(`Meter Link: ${$(el).attr('href')}`);
                }
            });

            // Follow to /meters
            console.log(`\n--- Fetching meters list at /meters ---`);
            res = await client.get(`${baseURL}/meters`);
            console.log(`Status: ${res.status}`);
            $ = cheerio.load(res.data);
            
            console.log("Meters Table:");
            $('table').each((i, tbl) => {
                console.log(`Table ID=${$(tbl).attr('id')} Class=${$(tbl).attr('class')}`);
                let firstRow = $(tbl).find('tr').first().text().replace(/\s+/g, ' ').trim();
                console.log(`  Headers: ${firstRow}`);
                let secondRow = $(tbl).find('tr').eq(1).text().replace(/\s+/g, ' ').trim();
                console.log(`  Row 1: ${secondRow}`);
                
                // Print links inside the first row
                $(tbl).find('tr').eq(1).find('a').each((j, a) => {
                    console.log(`  Link in row 1: ${$(a).attr('href')}`);
                });
            });
            
            // Find first meter ID link
            let firstMeterHref = $('table').find('tr').eq(1).find('a').first().attr('href');
            if (firstMeterHref) {
                console.log(`\n--- Fetching specific meter at ${firstMeterHref} ---`);
                res = await client.get(`${baseURL}${firstMeterHref}`);
                console.log(`Status: ${res.status}`);
                $ = cheerio.load(res.data);
                
                console.log("Meter Detail elements with IDs:");
                $('[id]').each((i, el) => {
                     let txt = $(el).text().replace(/\s+/g, ' ').trim();
                     if (txt.length > 0 && txt.length < 50) {
                         console.log(`  #${$(el).attr('id')}: ${txt}`);
                     }
                });
                
                let consLink = $('a').filter((i, el) => $(el).text().trim().toLowerCase().includes('consumption')).first().attr('href');
                if (consLink) {
                    console.log(`\n--- Fetching consumption at ${consLink} ---`);
                    res = await client.get(`${baseURL}${consLink}`);
                    console.log(`Status: ${res.status}`);
                    $ = cheerio.load(res.data);
                    
                    console.log("Consumption Table:");
                    $('table').each((i, tbl) => {
                        let firstRow = $(tbl).find('tr').first().text().replace(/\s+/g, ' ').trim();
                        console.log(`  Headers: ${firstRow}`);
                        let secondRow = $(tbl).find('tr').eq(1).text().replace(/\s+/g, ' ').trim();
                        console.log(`  Row 1: ${secondRow}`);
                    });
                }
            }
            
            // Look for hierarchy
            console.log(`\n--- Fetching /hierarchy ---`);
            res = await client.get(`${baseURL}/hierarchy`);
            console.log(`Status: ${res.status}`);
            if (res.status === 200) {
                $ = cheerio.load(res.data);
                if ($('table').length > 0) {
                    console.log("Hierarchy Table found.");
                } else {
                    console.log("Hierarchy format might be different:", res.data.substring(0, 300));
                }
            }

        }
    }
}

recon().catch(console.error);
