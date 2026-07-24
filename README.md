# Flock Energy API Wrapper

## Executive Summary
This repository contains a robust REST API wrapper engineered for the legacy Urja Meter Ops web application. The legacy portal relies entirely on server-side rendered (SSR) SvelteKit HTML without exposed JSON APIs. This service abstracts the complexities of HTML scraping and CSRF authentication, providing a clean, predictable JSON REST interface for downstream teams. 

Additionally, it features a **Modern Web Client** dashboard (the optional extension) showcasing interactive charts and metrics. Because the testing account has zero meters provisioned in the live portal, the dashboard includes a convenient "Demo Mode" toggle to simulate data and demonstrate the frontend capabilities.

## Where to Find Required Deliverables
- **`PROTOCOL.md`**: Located in the root directory. It contains a full analysis of the portal's authentication constraints, topology, and routing.
- **`openapi.json`**: Located in the root directory. It provides the OpenAPI 3.x schema for the clean REST API wrapper.
- **`REFLECTION.md`**: Located in the root directory. It contains the answers to the 5 required reflection questions.

## Architecture & Structure
- **Backend Framework**: Node.js with Express.js.
- **Session Layer**: Axios paired with `tough-cookie` and `axios-cookiejar-support`. This architecture natively heals sessions by transparently handling 401/403 redirects and CSRF strict-origin checks.
- **Parsing Engine**: Cheerio for high-performance DOM traversal and data extraction.
- **Structure**:
  - `src/index.js` — The Express router and Swagger documentation setup.
  - `src/client.js` — The core logic handling the Urja session management and DOM scraping heuristics.
  - `src/public/` — Contains the modern web client dashboard (HTML/CSS/JS).

## Installation & Running Locally

1. **Install Dependencies**:
```bash
npm install
```

2. **Start the Service**:
```bash
npm start
```
*(The service binds to port 3001 to prevent conflicts)*

3. **Explore the Interface**:
Open your browser to `http://localhost:3001/` to view the Modern Web Client dashboard, or `http://localhost:3001/docs` to view the interactive Swagger documentation.

## Sample Request

**Retrieve Meter Inventory**
```bash
curl -X GET http://localhost:3001/api/v1/meters
```
*Note: The provided test account (`operator@urja.local`) currently yields zero assigned meters in the real portal, thus gracefully returning `[]`.*

---

## Notes & Design Decisions

### Assumptions Made
- **Infrastructure Stability**: Assumed that the SSR layout and basic DOM structure (e.g., table indices) of the Urja portal will remain reasonably stable.
- **Single-Tenant Scope**: Assumed the scope of this API is for a single service-account (the operator), allowing me to design a highly optimized singleton `CookieJar` in memory rather than a complex distributed session store.

### Design Decisions & Trade-offs
- **Programmatic Scraping over Automation Tools**: I chose Cheerio + Axios rather than a headless browser (Puppeteer/Playwright). The trade-off is slightly higher vulnerability to DOM shifts, but the immense benefits are a fraction of the memory footprint, vastly superior execution speeds, and immediate deployment viability without complex containerization.
- **Heuristic Emptiness Detection**: Rather than relying on HTTP status codes (since the portal always returns 200 OK even when data is empty), the scraping algorithm strictly looks for specific error strings in the DOM (e.g., "No meters found.") to short-circuit array population and prevent out-of-bounds crashes.

### What Was Intentionally Skipped
- **Pagination Scraping**: Comprehensive pagination traversal was omitted to constrain scope. The current parser extracts data from the primary loaded view. 
- **Hidden Svelte State Parsing**: I intentionally avoided parsing Svelte's `__NEXT_DATA__` equivalent scripts embedded in the HTML, favoring pure DOM traversal. Extracting encoded internal state is significantly more fragile as frameworks evolve.

### What I Would Improve With More Time
- **Dynamic Header Resolution**: Instead of hard-coding array indices during Cheerio iteration (e.g., assuming `td[0]` is Meter ID), I would implement a strict `<thead>` resolution map to dynamically link text column names to indices. This would immunize the API against the legacy team casually inserting or reordering columns.
- **Distributed Caching**: For multi-tenant use at high volumes, I would move the session state out of application memory and into Redis, allowing stateless vertical scaling.
