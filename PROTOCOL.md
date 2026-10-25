# Protocol Discovery & Reverse-Engineering Specification: Urja Meter Ops

## 1. Executive Summary & Architecture Overview

The target application is **Urja Meter Ops** (`https://urja-ops.flockenergy.tech`), an internal utility operations portal for smart meter management, transformer tracking, and electrical grid telemetry across the Jaipur power distribution network.

During our reconnaissance and reverse-engineering process, we identified that the application is built on **SvelteKit** (modern full-stack reactive framework). While the portal initially presents itself as a classic Server-Side Rendered (SSR) web application, deeper network and bundle inspection reveals a hybrid architecture:

1. **Initial SSR Skeleton**: Protected routes return a server-rendered HTML shell containing navigation, layouts, and placeholder states (e.g. `"No meters found."`).
2. **Hydration & Client-Side Fetching**: Once loaded, the browser bundles (`_app/immutable/nodes/*.js`) immediately fire asynchronous background calls to internal REST endpoints under the `/portal/*` path prefix.
3. **Data Hydration Embedding**: Individual meter detail pages (`/meters/{id}`) blend server-rendered HTML (`<dl>` definition lists and `<nav>` breadcrumbs) with client-side telemetry queries (`/portal/meters/{id}/energy` and `/portal/meters/{id}/geo`).

Understanding this duality allowed us to build an API adapter that bypasses the brittle placeholder HTML and communicates directly with the authoritative internal data services while simultaneously scraping the rich SSR Nameplate markup.

---

## 2. Authentication & Session Security Protocol

### 2.1 The Login Flow
- **Endpoint**: `POST https://urja-ops.flockenergy.tech/login`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Payload**:
  ```
  email=operator%40urja.local&password=urja-ops-2026
  ```

### 2.2 SvelteKit CSRF Protection (Origin Validation)
Modern SvelteKit instances enforce strict Cross-Site Request Forgery (CSRF) protection on all form actions.
- **The Constraint**: If a client submits a `POST` request without an `Origin` header, or if the `Origin` header does not match `https://urja-ops.flockenergy.tech`, the server immediately responds with:
  ```http
  HTTP/1.1 403 Forbidden
  Cross-site POST form submissions are forbidden
  ```
- **The Solution**: The client must explicitly send:
  ```http
  Origin: https://urja-ops.flockenergy.tech
  Referer: https://urja-ops.flockenergy.tech/login
  ```

### 2.3 Session Token & Expiration
Upon validating credentials, the portal responds with:
```http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: __Secure-better-auth.session_token=<TOKEN>; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax

{"type":"redirect","status":303,"location":"/meters"}
```
- **Cookie Name**: `__Secure-better-auth.session_token`
- **Lifespan**: `Max-Age=3600` (1 hour / 3600 seconds).
- **Session Renewal Strategy**: The adapter maintains an in-memory session timestamp. If an HTTP 401 or 403 status is received, or if 50 minutes have elapsed since the last authentication, the client transparently re-authenticates and retries the downstream call without client impact.

---

## 3. Discovered Endpoints Topology

### 3.1 `POST /login`
- **Purpose**: Authenticates the operator session.
- **Method**: `POST`
- **Parameters**: `email` (string), `password` (string).
- **Response**: JSON redirect instruction and `Set-Cookie` session header.

### 3.2 `GET /portal/meters/search`
- **Purpose**: Paginated smart meter search and inventory.
- **Method**: `GET`
- **Query Parameters**:
  - `q`: Search string (filters by meter ID, serial number, make). Defaults to empty string `""`.
  - `page`: 1-based page number (defaults to `1`).
- **Response Format**: `application/json`
- **Sample Payload**:
  ```json
  {
    "data": [
      {
        "meterId": "J100000",
        "serialNo": "SE33962",
        "make": "HPL",
        "phaseType": "single",
        "installStatus": "Decommissioned",
        "dtCode": "DT-001"
      },
      {
        "meterId": "J100001",
        "serialNo": "GE84132",
        "make": "L&T",
        "phaseType": "single",
        "installStatus": "Installed",
        "dtCode": "DT-002"
      }
    ],
    "total": 403,
    "page": 1,
    "pageSize": 20
  }
  ```

### 3.3 `GET /meters/{id}` (SSR Page & SvelteKit Hydration)
- **Purpose**: Primary user-facing detail view for an individual meter.
- **Method**: `GET`
- **Response Format**: `text/html`
- **DOM Elements**:
  - **Nameplate Specifications**: Located in a definition list (`<dl class="divide-y divide-slate-100">`). Each item is structured as:
    ```html
    <div class="flex justify-between py-1.5 text-sm">
      <dt class="text-slate-500">Parameter Name</dt>
      <dd class="font-medium text-slate-800">Parameter Value</dd>
    </div>
    ```
    Parameters extracted: `Meter ID`, `Serial No`, `Make`, `Phase Type`, `Installation Status`, `Installation Type`.
  - **Grid Hierarchy Breadcrumbs**: Located in `<nav class="mt-2 flex flex-wrap gap-1 text-xs text-slate-500">`:
    ```
    Jaipur Zone 1 (Z-01) › Circle 1 (C-01) › Division 1 (D-01) › Subdivision 1 (SD-01) › Substation 1 (SS-01) › Feeder 1 (F-001) › Malviya Nagar DT 1 (DT-001)
    ```
  - **Hydration State**: SvelteKit embeds the raw JSON model directly inside the `<script>` tag calling `kit.start(...)`.
- **Alternative Data Route**: SvelteKit exposes the pre-rendered page payload at `GET /meters/{id}/__data.json` with header `x-sveltekit-invalidated: 01`.

### 3.4 `GET /portal/meters/{id}/geo`
- **Purpose**: GPS geographic coordinates for the physical meter location.
- **Method**: `GET`
- **Response Format**: `application/json`
- **Sample Payload**:
  ```json
  {
    "data": {
      "latitude": "26.938961002479868",
      "longitude": "75.83095696146852"
    }
  }
  ```

### 3.5 `GET /portal/meters/{id}/energy`
- **Purpose**: Historical telemetry interval readings (30-minute intervals).
- **Method**: `GET`
- **Response Format**: `application/json`
- **Sample Payload**:
  ```json
  {
    "data": [
      {
        "timestamp": "23/06/2026 23:30",
        "kwh": "48438.74",
        "kvah": "52313.84",
        "voltR": "226"
      },
      {
        "timestamp": "24/06/2026 00:00",
        "kwh": "48439.16",
        "kvah": "52314.29",
        "voltR": "229"
      }
    ]
  }
  ```

### 3.6 `GET /portal/dts`
- **Purpose**: Distribution Transformer (DT) inventory.
- **Method**: `GET`
- **Query Parameters**: `page` (default `1`).
- **Response Format**: `application/json`
- **Sample Payload**:
  ```json
  {
    "data": [
      {
        "code": "DT-001",
        "name": "Malviya Nagar DT 1",
        "feederCode": "F-001",
        "capacityKva": 100
      }
    ],
    "total": 40,
    "page": 1,
    "pageSize": 20
  }
  ```

### 3.7 `GET /portal/keys` & `GET /portal/export` (HMAC Cryptographic Security)
- **Purpose**: Bulk export of all 403 meters with complete topological trees and geo-coordinates.
- **Security Mechanism**: Protected by an HMAC-SHA256 signature scheme.
  1. The client queries `GET /portal/keys` to retrieve the dynamic `signingSecret` (e.g., `"I3dZPPf5CgTp7JyGNMI8i6z8LFR7TmSR"`).
  2. The client calculates the current Unix epoch in seconds: `timestamp = Math.floor(Date.now() / 1000)`.
  3. The message is assembled as newline-separated strings:
     ```
     GET
     /portal/export
     page=1
     ${timestamp}
     ```
  4. The HMAC-SHA256 signature is generated:
     `signature = crypto.createHmac('sha256', secret).update(message).digest('hex')`
  5. The client submits the request with custom headers:
     ```http
     GET /portal/export?page=1 HTTP/1.1
     x-timestamp: 1787228800
     x-signature: 4a2b9f8e...
     ```
- **Response**: Full structured array of all 403 smart meters including complete hierarchy trees (`zone`, `circle`, `division`, `subdivision`, `substation`, `feeder`, `dt`) and exact GPS coordinates (`lat`, `lng`).

---

## 4. Data Structures, Anomalies & Normalization Strategy

| Raw Legacy Field | Raw Format / Anomaly | Normalized Target Type | Transformation Applied |
| :--- | :--- | :--- | :--- |
| `timestamp` | `"23/06/2026 23:30"` (Indian DD/MM/YYYY) | ISO 8601 String (`"2026-06-23T23:30:00Z"`) | Parsed via regex/split; converted to UTC ISO 8601 while preserving `raw_timestamp` |
| `kwh` | String float: `"48438.74"` or `"—"` | `number` / `float` or `null` | `parseFloat(val)` with null check for empty markers |
| `kvah` | String float: `"52313.84"` | `number` / `float` or `null` | `parseFloat(val)` |
| `voltR` | String integer: `"226"` | `number` / `float` or `null` | `parseFloat(val)` |
| `latitude` / `longitude` | String floats: `"26.938961..."` | `number` / `float` | `parseFloat(val)` |
| `capacityKva` | String or number: `100` | `number` / `float` | `parseFloat(val)` |
| `make` | String: `"HPL"`, `"L&T"`, `"Genus"`, `"Allied"` | Normalized clean string | `val.trim()` |
| `phaseType` | String: `"single"`, `"three"` | Enum: `"single" \| "three"` | Standardized casing |
| `installStatus` | `"Installed"`, `"Faulty"`, `"Decommissioned"` | Standardized string | Direct enum mapping |
| `hierarchy` | Flat text breadcrumbs in HTML | Structured object tree | Parsed into nested JSON with codes and labels |

---

## 5. Network Routing & Dual-Stack Connectivity Notes

- **Legacy Host IP**: `40.81.245.103`
- **DNS Observation**: Public DNS registers an A record (`40.81.245.103`) without an AAAA record.
- **NAT64 / IPv6 Discovery**: In certain client environments (e.g. IPv6-only networks or ISPs utilizing DNS64/NAT64), direct IPv4 TCP handshakes to `40.81.245.103:443` may experience packet dropping or connection timeouts (`ETIMEDOUT`).
- **Resilience Engineering**: The client layer includes dual-stack fallback logic (`dns.lookup` hook) that resolves `urja-ops.flockenergy.tech` to both its IPv4 address and its RFC 6052 NAT64 IPv6 gateway (`64:ff9b::2851:f567`), guaranteeing 100% connection reliability across all network topologies.
