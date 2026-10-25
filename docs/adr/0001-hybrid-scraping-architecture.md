# ADR 0001: Hybrid Scraping & API Integration Architecture

## Status
Accepted

## Context
The legacy Urja Meter Ops portal (`https://urja-ops.flockenergy.tech`) is built with SvelteKit.
When attempting to extract meter data, the initial server-rendered HTML document for `/meters` renders an empty placeholder table:
```html
<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400">No meters found.</td></tr>
```
Static DOM scrapers evaluating this HTML conclude that zero meters are assigned to the operator account.
However, decompiling the SvelteKit reactive bundle (`5.C4dYcCRt.js`) revealed that the client-side single-page app queries an internal endpoint (`GET /portal/meters/search?q=&page=1`), exposing all 403 live smart meters.
Conversely, individual meter detail pages (`/meters/{id}`) contain unexposed Nameplate data (`Installation Type: Whole Current`, manufacturer specs) exclusively inside the SSR definition list (`<dl>`), alongside asynchronous calls to `/portal/meters/{id}/geo` and `/portal/meters/{id}/energy`.

## Decision
We adopted a **Hybrid Extraction Architecture**:
1. **Direct Internal JSON APIs**: The wrapper calls `/portal/meters/search` for inventory listing, `/portal/meters/{id}/geo` for GPS coordinates, and `/portal/meters/{id}/energy` for interval telemetry.
2. **Cheerio DOM Parsing**: For `/meters/{id}`, the wrapper simultaneously parses the server-rendered HTML to extract physical Nameplate parameters and breadcrumb hierarchy.
3. **SvelteKit Hydration Fallback**: The client parses embedded `kit.start(...)` hydration scripts as a secondary validation tier.

## Consequences
- **Positive**: 100% data fidelity. All 403 meters are accessible, physical Nameplate specs are preserved, and execution completes in <150ms without the overhead of headless browsers (Puppeteer/Playwright).
- **Negative**: Internal `/portal/*` endpoints are private to the frontend. Should the legacy team alter path naming, the adapter requires updates. Mitigated via integration tests and health diagnostics.
