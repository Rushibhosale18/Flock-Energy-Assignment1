# Engineering Reflection & Architectural Post-Mortem
**Project**: Flock Energy — Urja Meter Ops REST API Wrapper  
**Author**: Flock Energy Platform Engineering  
**Date**: October 2026

---

### 1. What assumptions did you make?

1. **Authentication Paradigm & Operational Scope**:
   I assumed that this API wrapper operates primarily as a centralized backend integration service on behalf of an enterprise operations desk rather than an end-user identity broker. This allowed me to model session authentication as a persistent, self-healing singleton `CookieJar` in the service layer, abstracting the upstream SvelteKit cookie mechanics entirely away from downstream API consumers.
2. **Hybrid Telemetry Model**:
   I assumed that downstream clients demand both structural nameplate metadata (such as `Installation Type: Whole Current`, manufacturer details, and grid breadcrumbs) and high-frequency time-series telemetry (energy readings and GPS coordinates). Because the legacy portal splits these across server-rendered HTML pages and client-side JSON micro-endpoints, I assumed a hybrid extraction strategy—coupling Cheerio DOM parsing with asynchronous API queries—was necessary to provide a unified data model.
3. **Immutability of Historical Interval Telemetry**:
   I assumed that historical 30-minute interval readings are strictly append-only and immutable. This informed the design of our data normalization pipelines, converting string floats into native IEEE 754 numbers and ISO 8601 timestamps without risk of retroactive schema mutation.
4. **Network Heterogeneity**:
   I assumed that this service would be evaluated and deployed across heterogeneous network topographies, including modern cellular networks and VPCs operating behind NAT64/DNS64 gateways. This drove the implementation of dual-stack DNS fallback hooks.

---

### 2. Which part was the most difficult, and how did you get unstuck?

The most difficult challenge was uncovering the **true data layer beneath the deceptive SvelteKit SSR placeholder**.

When initiating initial reconnaissance against `GET /meters`, the server-rendered HTML document contained an empty table with the exact text:
```html
<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">No meters found.</td></tr>
```
In many legacy systems, an empty table suggests that the test account lacks hardware provisioning. However, assuming "zero meters assigned" would have crippled the wrapper and forced artificial mock data.

#### How I Got Unstuck:
1. **Source Bundle Analysis**: Rather than treating the page as static HTML, I downloaded and inspected the compiled SvelteKit JavaScript bundles linked in the HTML `<head>`, specifically `_app/immutable/nodes/5.C4dYcCRt.js` (the meters route component).
2. **Decompiling Reactive Fetches**: Decompiling the minified bundle revealed that the table was merely a mounting skeleton. Upon hydration, SvelteKit executed:
   ```javascript
   let e = await (await fetch(`/portal/meters/search?q=${encodeURIComponent(k)}&page=${A}`)).json();
   ```
3. **Verification**: Executing this endpoint directly with our authenticated session cookie immediately yielded **403 live smart meters**!
4. **Systematic Surface Mapping**: Applying this reverse-engineering technique across all client bundles (`6.l777LXKL.js` and `4.2Bgc2kUI.js`) exposed the hidden telemetry routes (`/portal/meters/{id}/geo` and `/portal/meters/{id}/energy`), as well as the HMAC-SHA256 request signing protocol for bulk export (`/portal/keys` and `/portal/export`).

A secondary difficulty was SvelteKit's built-in CSRF defense: requests to `POST /login` lacking an explicit `Origin: https://urja-ops.flockenergy.tech` header were immediately dropped with an HTTP `403 Forbidden` status. Identifying this header requirement in browser network frames immediately unblocked authentication.

---

### 3. If you had another day, what would you improve?

1. **Distributed Session Storage & Distributed Locking (Redis)**:
   Currently, session tokens and mutex locks are maintained in process memory. In a horizontally scaled container cluster (e.g. Kubernetes with multiple replicas), simultaneous node boots could trigger concurrent re-authentications against the legacy portal. Storing session cookies in Redis with Redlock-based mutex locking would ensure cluster-wide session reuse.
2. **Incremental Telemetry Ingestion & Caching**:
   Each meter returns 337+ interval readings (~7 days of 30-minute intervals). I would implement a Redis TimeSeries or PostgreSQL/TimescaleDB caching layer that queries only delta intervals using conditional HTTP requests (`ETag` or `If-Modified-Since`), drastically reducing upstream bandwidth.
3. **Circuit Breakers & Rate Limiting**:
   Incorporate resilience policies using libraries like `cockatiel` to enforce rate limits and circuit breaking. If the legacy portal slows down or returns 500s, the circuit breaker would open, serving cached data rather than cascading failure downstream.
4. **Headless Browser Fallback Tier**:
   While our direct HTTP client (`axios` + `cheerio`) achieves sub-150ms response times with negligible memory overhead, an isolated fallback tier using Playwright could be maintained to automatically recover should the legacy portal alter internal route paths without notice.

---

### 4. What mistake did you make while solving this (there's always one)?

Early in the implementation, I assumed that SvelteKit's `POST /login` endpoint followed standard HTTP 302/303 redirect conventions by issuing an HTTP `302 Found` status code with a `Location: /meters` header.

Consequently, my initial session verification logic asserted `res.status === 302 || res.status === 303`. However, SvelteKit's form action handler actually responds with an **HTTP `200 OK`** containing a JSON payload:
```json
{"type": "redirect", "status": 303, "location": "/meters"}
```
Because my validation logic rejected HTTP 200 on `/login`, the client treated successful authentications as failures and entered an infinite re-login loop.

Once I inspected the raw network frames and recognized SvelteKit's JSON-wrapped redirect protocol, I updated the adapter to accept HTTP 200, parse the redirect envelope, and verify the presence of the `__Secure-better-auth.session_token` cookie directly.

---

### 5. If you were reviewing your own submission, what would you criticise?

1. **Global `dns.lookup` Monkey-Patch**:
   To prevent TCP timeouts when reaching the legacy host (`40.81.245.103`) over NAT64/IPv6 networks, I patched Node's global `dns.lookup` function. While highly effective and transparent to Axios, monkey-patching global standard library methods is an invasive pattern that could introduce side-effects in larger, multi-service codebases. A cleaner architecture would configure an explicit `https.Agent` with a custom `lookup` resolver attached solely to the Urja HTTP client.
2. **In-Memory Hierarchy Tree Aggregation**:
   The `/api/v1/hierarchy` endpoint dynamically pulls all 403 meters via the signed export API and builds a 7-tier electrical distribution tree in process memory on every invocation. While execution is fast (~350ms for 403 meters), this approach will not scale if the utility expands to 500,000 meters. The tree should be cached with an invalidation TTL.
3. **Absence of Stored E2E Contract Tests**:
   While our test suite includes 22 passing tests covering both unit normalization and live upstream integration, it relies on the live portal URL being reachable. I would introduce recorded contract fixtures (e.g. using `nock` or VCR) so CI pipelines can execute deterministically in air-gapped environments.
