# Architectural Reflection & Engineering Analysis

### 1. What assumptions did you make?

1. **Authentication Scope and Multi-Tenancy**: I assumed that this proxy service primarily operates on behalf of an automated system or utility operator using a shared service credential (`operator@urja.local`). This allowed me to design a persistent, self-healing in-memory `CookieJar` and session manager rather than forcing downstream API consumers to manage raw SvelteKit session cookies or orchestrate credentials on every request.
2. **Hybrid Scraping Model**: I assumed that while the internal JSON APIs (`/portal/*`) are the most accurate and performant way to fetch telemetry and inventories, downstream clients also require legacy physical specifications (e.g. detailed Nameplate parameters like `Installation Type: Whole Current` and hierarchical breadcrumbs). Therefore, I chose a hybrid approach: parsing the SSR HTML on `/meters/{id}` with Cheerio while concurrently querying `/portal/meters/{id}/geo` and `/portal/meters/{id}/energy`.
3. **Data Immutability & Volatility**: I assumed that interval telemetry data (energy readings) is appended chronologically every 30 minutes, whereas smart meter metadata (make, phase type, serial number) remains relatively static.
4. **Environment Portability**: I assumed that downstream consumers might deploy this service in diverse networking environments (including dual-stack IPv4/IPv6 cellular networks and cloud VPCs). This informed the inclusion of DNS fallback resolution for the legacy server.

---

### 2. Which part was the most difficult, and how did you get unstuck?

The most difficult challenge was uncovering the **true data layer beneath the misleading SvelteKit SSR placeholder**.

When initiating programmatic scraping of `GET /meters`, the server-rendered HTML contained an empty table with the exact text:
```html
<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">No meters found.</td></tr>
```
It was tempting to conclude that the test operator account simply had no assigned meters. However, an empty inventory for an operations assignment felt suspicious.

**How I got unstuck:**
1. Rather than treating the page as static HTML, I inspected the client-side JavaScript assets referenced in the `<head>` tag, specifically `_app/immutable/nodes/5.C4dYcCRt.js` (the meters view component).
2. Inside the minified bundle, I decompiled the reactive SvelteKit state and discovered:
   ```javascript
   let e = await (await fetch(`/portal/meters/search?q=${encodeURIComponent(k)}&page=${A}`)).json();
   ```
3. Calling this endpoint with our authenticated session cookie immediately revealed **403 live smart meters**!
4. Repeating this deep bundle analysis across `6.l777LXKL.js` and `4.2Bgc2kUI.js` revealed the hidden endpoints for GPS coordinates (`/portal/meters/{id}/geo`), 30-minute interval readings (`/portal/meters/{id}/energy`), and even the HMAC-SHA256 signed export route (`/portal/export`).

A secondary hurdle was SvelteKit's built-in CSRF protection: submitting `POST /login` without an explicit `Origin: https://urja-ops.flockenergy.tech` caused immediate `403 Forbidden` errors. Identifying the missing header in the SvelteKit form action spec quickly resolved this.

---

### 3. If you had another day, what would you improve?

1. **Distributed Session & Response Caching with Redis**:
   Currently, session tokens and responses are managed in process memory. In a distributed, multi-container production cluster, I would move the `CookieJar` and session locks to a Redis cluster. This would allow multiple API instances to share warm sessions without hitting login rate limits on the legacy portal.
2. **Incremental Telemetry Caching & ETag Support**:
   Energy interval readings consist of 337+ data points per meter. I would implement an incremental synchronization cache with conditional ETags, fetching only readings newer than the latest stored timestamp.
3. **Resilient Fallback Parser**:
   If the internal `/portal/meters/search` endpoint were ever restricted, the service should gracefully fall back to parsing headless SSR pages. A headless browser fallback (Playwright) could be kept in reserve for when legacy JavaScript bundles change.
4. **Rate-Limiting & Circuit Breakers**:
   Add resilience policies using `cockatiel` or `express-rate-limit` to prevent downstream spikes from hammering the legacy portal and triggering IP bans.

---

### 4. What mistake did you make while solving this (there's always one)?

Early in the investigation, I initially mistook the `Set-Cookie` session lifetime for standard session-only cookies and assumed that `/login` would respond with an HTTP `302 Found` or `303 See Other` status code with a `Location` header.

In reality, SvelteKit responds with `HTTP 200 OK` and a JSON body containing `{"type":"redirect","status":303,"location":"/meters"}`. Because my initial validation checked for `res.status === 303 || res.status === 302`, the client incorrectly flagged successful authentications as failures and attempted infinite re-login loops.

Once I inspected the raw network stream and recognized SvelteKit's JSON-wrapped redirect protocol, I adjusted the status checks to accept `200` with the redirect payload and verified the presence of the `__Secure-better-auth.session_token` cookie directly.

---

### 5. If you were reviewing your own submission, what would you criticise?

1. **Dual-Stack DNS Patching Technique**:
   To ensure compatibility with environments where IPv4 to `40.81.245.103` times out, I patched `dns.lookup` globally at process initialization. While effective and transparent to Axios and native HTTPS, modifying Node's global `dns.lookup` is an invasive monkey-patch that could potentially affect other outbound dependencies in a large microservices codebase. A cleaner, more isolated solution would be to pass a custom `http.Agent` with a configured `lookup` function directly to the Axios instance (though `axios-cookiejar-support` requires careful wrapping to allow custom agents).
2. **Hierarchy Tree Construction Memory Footprint**:
   The `/api/v1/hierarchy` endpoint builds the complete tree by retrieving all 403 meters via the signed export API and assembling the 7-tier electrical hierarchy in memory. While response times are fast (~250ms), at scale (e.g. 100,000 meters) this in-memory grouping should be streamed or cached with TTL invalidation rather than computed on each request.
3. **Automated Unit & Mock Testing**:
   While the integration test suite successfully exercises live endpoints against the actual portal, I would add comprehensive offline mock tests using `nock` to ensure deterministic CI/CD pipeline execution even when the legacy server is in maintenance mode.
