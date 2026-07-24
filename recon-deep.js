const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html', 'Origin': 'https://urja-ops.flockenergy.tech', 'Referer': 'https://urja-ops.flockenergy.tech/login' } }));
const baseURL = 'https://urja-ops.flockenergy.tech';
async function test() {
    await client.post(baseURL + '/login', 'email=operator%40urja.local&password=urja-ops-2026', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    
    // 1. Check transformers
    let res = await client.get(baseURL + '/transformers');
    console.log('Transformers Page HTML length:', res.data.length);
    let $ = cheerio.load(res.data);
    console.log('Transformers table text:');
    $('table').each((i, tbl) => { console.log($(tbl).text().substring(0, 200).replace(/\s+/g, ' ')); });
    
    console.log('Transformer links:');
    $('a[href^="/transformers/"]').each((i, a) => console.log($(a).attr('href')));

    // 2. Try to get a specific transformer to see if it lists meters
    let firstTr = $('a[href^="/transformers/"]').first().attr('href');
    if (firstTr) {
        console.log(`\nFetching ${firstTr}...`);
        res = await client.get(baseURL + firstTr);
        $ = cheerio.load(res.data);
        console.log('Transformer details table:');
        $('table').each((i, tbl) => { console.log($(tbl).text().substring(0, 200).replace(/\s+/g, ' ')); });
        console.log('Meters under transformer:');
        $('a[href^="/meters/"]').each((i, a) => console.log($(a).attr('href')));
    }

    // 3. Try search parameters on /meters
    res = await client.get(baseURL + '/meters?q=a');
    $ = cheerio.load(res.data);
    console.log('\nMeters search ?q=a table text:');
    $('table').each((i, tbl) => { console.log($(tbl).text().substring(0, 200).replace(/\s+/g, ' ')); });

    let svelte = res.data.match(/__sveltekit_[a-z0-9]+/);
    console.log('\nSvelteKit match:', svelte ? 'Found' : 'Not Found');
}
test().catch(console.error);
