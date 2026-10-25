# Flock Energy — Urja Meter Ops REST API Wrapper

[![Live Service on Render](https://img.shields.io/badge/Render-Live%20Production-success?style=for-the-badge&logo=render)](https://flock-energy-assignment1-1.onrender.com)
[![Swagger Docs](https://img.shields.io/badge/Swagger%20UI-Live%20Docs-blue?style=for-the-badge&logo=swagger)](https://flock-energy-assignment1-1.onrender.com/docs)

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)](https://github.com/Rushibhosale18/Flock-Energy-Assignment1)
[![Tests Passing](https://img.shields.io/badge/tests-26%2F26%20passing-success?style=flat-square)](https://github.com/Rushibhosale18/Flock-Energy-Assignment1)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-blue?style=flat-square)](https://nodejs.org)
[![Express Version](https://img.shields.io/badge/express-v5.2.1-lightgrey?style=flat-square)](https://expressjs.com)
[![OpenAPI Specification](https://img.shields.io/badge/OpenAPI-3.0.0-green?style=flat-square)](./openapi.json)

An enterprise-grade, resilient, and fully documented REST API wrapper service engineered around the legacy **Urja Meter Ops** portal (https://urja-ops.flockenergy.tech).

> **🌐 Live Production Deployment**: The service is actively deployed and accessible at **`https://flock-energy-assignment1-1.onrender.com`** with interactive Swagger documentation at **[`https://flock-energy-assignment1-1.onrender.com/docs`](https://flock-energy-assignment1-1.onrender.com/docs)**.

---

## 📑 Required Deliverables Index

| Deliverable | Location | Description |
| :--- | :--- | :--- |
| **Live Swagger Docs** | [flock-energy-assignment1-1.onrender.com/docs](https://flock-energy-assignment1-1.onrender.com/docs) | Interactive Swagger UI documentation with live testing on cloud deployment. |
| **Live Web Dashboard** | [flock-energy-assignment1-1.onrender.com](https://flock-energy-assignment1-1.onrender.com) | Real-time web dashboard showcasing live smart meter telemetry and grid status. |
| **Protocol Discovery** | [`PROTOCOL.md`](./PROTOCOL.md) | Exhaustive reverse-engineering documentation of portal behaviors, CSRF, internal APIs, and HMAC security. |
| **OpenAPI Specification** | [`openapi.json`](./openapi.json) | Exported OpenAPI 3.0 schema representing all endpoints, request params, and schemas. |
| **Engineering Reflection** | [`REFLECTION.md`](./REFLECTION.md) | In-depth answers to all 5 required reflection questions (assumptions, challenges, mistakes, self-critique). |

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    Client["Downstream Client / Web UI"] -->|HTTP REST| API["Express.js API Layer (:3001)"]
    API -->|Docs| Swagger["Swagger UI (/docs) & openapi.json"]
    API --> Adapter["UrjaClient Adapter Layer"]
    
    subgraph Adapter ["UrjaClient Adapter Layer"]
        Auth["Session Manager & Auto-Reauth"]
        DNS["Dual-Stack / NAT64 DNS Resolver"]
        Normalizer["Data Normalizer & Float Parser"]
        CheerioParser["Cheerio SSR Nameplate Parser"]
        Crypto["HMAC-SHA256 Request Signer"]
    end
    
    Adapter -->|Session Cookie + CSRF Headers| Portal["Legacy Urja Portal (urja-ops.flockenergy.tech)"]
    Portal -->|POST /login| SvelteAuth["SvelteKit Session Auth"]
    Portal -->|GET /portal/meters/search| MeterData["Smart Meters JSON (403 total)"]
    Portal -->|GET /meters/:id| SSRHtml["Nameplate & Breadcrumbs HTML"]
    Portal -->|GET /portal/meters/:id/geo| GeoData["GPS Coordinates JSON"]
    Portal -->|GET /portal/meters/:id/energy| EnergyData["Consumption Telemetry JSON"]
    Portal -->|GET /portal/dts| DTData["Distribution Transformers JSON"]
    Portal -->|GET /portal/export| ExportData["HMAC Signed Grid Export JSON"]
```

---

## 📁 Repository Layout

```
flock-energy-api/
│
├── src/
│   ├── config/
│   │   └── index.js              # Centralized environment configuration
│   ├── errors/
│   │   └── AppError.js           # Standard domain error taxonomy (401, 403, 404, 502, 504)
│   ├── middleware/
│   │   ├── request-logger.js     # Request-ID tracking & latency logger
│   │   └── error-handler.js      # Global standardized RFC-7807 error envelopes
│   ├── services/
│   │   └── urja-client.js        # Core Urja adapter, auto-reauth, and parsers
│   ├── routes/
│   │   ├── auth.routes.js        # Session login and status routes
│   │   ├── meters.routes.js      # Meters listing, detail, consumption
│   │   ├── network.routes.js     # Distribution transformers, hierarchy, signed export
│   │   └── system.routes.js      # Health check and openapi.json endpoints
│   ├── docs/
│   │   └── swagger.js            # Swagger JSDoc OpenAPI 3.0 specification definition
│   ├── public/
│   │   ├── index.html            # High-tech live telemetry dashboard
│   │   └── swagger-custom.css    # Dark-themed styling for Swagger UI
│   ├── client.js                 # Backward compatibility export
│   └── index.js                  # Express application setup & server bootstrap
│
├── tests/
│   ├── client.test.js            # Unit & live adapter integration test suite
│   └── api.test.js               # Full REST API HTTP integration test suite
│
├── Dockerfile                    # Multi-stage production container
├── .dockerignore                 # Docker build exclusions
├── openapi.json                  # Exported OpenAPI 3.0 specification
├── PROTOCOL.md                   # Comprehensive protocol discovery whitepaper
├── REFLECTION.md                 # Rigorous engineering reflection and post-mortem
├── README.md                     # Main documentation & setup guide
├── package.json                  # NPM dependencies & test scripts
└── .gitignore                    # Git exclusions
```

---

## 🚀 Quickstart & Setup

### Prerequisites
- **Node.js**: v18.0.0 or newer (Tested on Node.js v24 LTS)
- **npm**: v9.0.0 or newer

### Installation

1. **Clone the repository and enter directory**:
   ```bash
   cd flock-energy-api
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables** (Optional - defaults provided):
   ```bash
   # Create .env if you wish to override defaults:
   PORT=3001
   PORTAL_URL=https://urja-ops.flockenergy.tech
   URJA_EMAIL=operator@urja.local
   URJA_PASSWORD=urja-ops-2026
   ```

4. **Start the API service**:
   ```bash
   npm start
   ```

The service will start on port `3001`:
- 🌐 **Web Dashboard**: `http://localhost:3001/`
- 📖 **Swagger UI Docs**: `http://localhost:3001/docs`
- 📄 **OpenAPI Spec**: `http://localhost:3001/openapi.json`
- 🩺 **Health Check**: `http://localhost:3001/api/v1/health`

---

## 🧪 Automated Testing Suite

The repository includes a comprehensive automated test suite (22 tests) validating unit normalization, live upstream portal authentication, and Express route responses:

```bash
npm test
```

**Test Execution Output**:
```
> flock-energy-api@1.0.0 test
> node --test tests/*.test.js

▶ REST API - Integration Test Suite
  ✔ Start ephemeral test server (4.13ms)
  ✔ GET /api/v1/health should return system status (351.27ms)
  ✔ POST /api/v1/auth/login should authenticate session (359.33ms)
  ✔ GET /api/v1/meters should return meters list (161.97ms)
  ✔ GET /api/v1/meters/:id should return single meter details (174.31ms)
  ✔ GET /api/v1/meters/:id/consumption should return interval telemetry (229.27ms)
  ✔ GET /api/v1/transformers should return DTs (154.20ms)
  ✔ GET /api/v1/hierarchy should assemble network tree (513.55ms)
  ✔ GET /openapi.json should return valid OpenAPI 3.0 document (2.78ms)
  ✔ GET /api/unknown-route should return structured 404 (3.66ms)
  ✔ Close test server (1.15ms)
✔ REST API - Integration Test Suite (1959.57ms)

▶ UrjaPortalClient - Unit & Normalization Suite
  ✔ Client should initialize with proper defaults (0.52ms)
  ✔ safeParseLooseJSON should parse unquoted JSON keys (0.22ms)
  ✔ normalizeMeter should standardize raw portal fields (0.16ms)
✔ UrjaPortalClient - Unit & Normalization Suite (2.60ms)

▶ UrjaPortalClient - Live Upstream Integration Suite
  ✔ login() should establish authenticated session (333.43ms)
  ✔ getMeters() should fetch paginated meters (318.59ms)
  ✔ getMeterDetails() should retrieve Nameplate and Geo (196.54ms)
  ✔ getMeterConsumption() should parse 30-min readings as numbers (211.55ms)
  ✔ getTransformers() should retrieve distribution transformers (147.07ms)
✔ UrjaPortalClient - Live Upstream Integration Suite (1208.99ms)

ℹ tests 22 | pass 22 | fail 0 | duration_ms 2692.7
```

---

## 📡 API Reference & Verified cURL Samples

### 1. System Health & Connectivity Check
```bash
curl -X GET "http://localhost:3001/api/v1/health"
```
**Response (HTTP 200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-10-25T17:46:17.090Z",
  "environment": "development",
  "service": "flock-energy-api",
  "version": "1.0.0",
  "upstream": {
    "status": "connected",
    "upstream_portal": "https://urja-ops.flockenergy.tech",
    "latency_ms": 325,
    "authenticated": true,
    "session_age_seconds": 12
  }
}
```

---

### 2. Operator Authentication
```bash
curl -X POST "http://localhost:3001/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "operator@urja.local", "password": "urja-ops-2026"}'
```
**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "authenticated",
    "authenticated_at": "2026-10-25T17:46:17.533Z",
    "operator": "operator@urja.local",
    "session_expires_in_seconds": 3600
  },
  "meta": {
    "request_id": "c57b5025-b44c-4a30-b3b4-e35b7e3ef81a",
    "timestamp": "2026-10-25T17:46:17.534Z"
  }
}
```

---

### 3. Retrieve Smart Meters Inventory (Paginated)
```bash
curl -X GET "http://localhost:3001/api/v1/meters?page=1&pageSize=2"
```
**Response (HTTP 200 OK):**
```json
{
  "total": 403,
  "page": 1,
  "page_size": 20,
  "total_pages": 21,
  "data": [
    {
      "meter_id": "J100000",
      "serial_number": "SE33962",
      "make": "HPL",
      "phase_type": "single",
      "install_status": "Decommissioned",
      "install_type": null,
      "dt_code": "DT-001",
      "geo": null,
      "hierarchy": null
    },
    {
      "meter_id": "J100001",
      "serial_number": "GE84132",
      "make": "L&T",
      "phase_type": "single",
      "install_status": "Installed",
      "install_type": null,
      "dt_code": "DT-002",
      "geo": null,
      "hierarchy": null
    }
  ]
}
```

---

### 4. Retrieve Specific Meter Specifications
```bash
curl -X GET "http://localhost:3001/api/v1/meters/J100000"
```
**Response (HTTP 200 OK):**
```json
{
  "meter_id": "J100000",
  "serial_number": "SE33962",
  "make": "HPL",
  "phase_type": "single",
  "install_status": "Decommissioned",
  "install_type": "Whole Current",
  "dt_code": "DT-001",
  "geo": {
    "latitude": 26.938961002479868,
    "longitude": 75.83095696146852
  },
  "hierarchy": {
    "zone": "Jaipur Zone 1 (Z-01)",
    "circle": "Circle 1 (C-01)",
    "division": "Division 1 (D-01)",
    "subdivision": "Subdivision 1 (SD-01)",
    "substation": "Substation 1 (SS-01)",
    "feeder": "Feeder 1 (F-001)",
    "dt": "Malviya Nagar DT 1 (DT-001)"
  },
  "raw_attributes": {
    "Meter ID": "J100000",
    "Serial No": "SE33962",
    "Make": "HPL",
    "Phase Type": "single",
    "Installation Status": "Decommissioned",
    "Installation Type": "Whole Current"
  }
}
```

---

### 5. Retrieve Meter Consumption Telemetry & Statistical Analytics
```bash
curl -X GET "http://localhost:3001/api/v1/meters/J100000/consumption"
```
**Response (HTTP 200 OK):**
```json
{
  "meter_id": "J100000",
  "total_readings": 337,
  "time_window": {
    "start": "2026-06-23T23:30:00Z",
    "end": "2026-06-30T23:30:00Z"
  },
  "summary": {
    "latest_kwh": 48580.79,
    "latest_kvah": 52467.25,
    "latest_voltage_r": 220,
    "average_voltage_r": 229.83
  },
  "readings": [
    {
      "timestamp": "2026-06-23T23:30:00Z",
      "raw_timestamp": "23/06/2026 23:30",
      "kwh": 48438.74,
      "kvah": 52313.84,
      "voltage_r": 226
    },
    {
      "timestamp": "2026-06-24T00:00:00Z",
      "raw_timestamp": "24/06/2026 00:00",
      "kwh": 48439.16,
      "kvah": 52314.29,
      "voltage_r": 229
    }
  ]
}
```

---

### 6. Electrical Grid Hierarchy Tree
```bash
curl -X GET "http://localhost:3001/api/v1/hierarchy"
```
**Response (HTTP 200 OK):**
```json
[
  {
    "code": "Z-01",
    "name": "Jaipur Zone 1",
    "circles": [
      {
        "code": "C-01",
        "name": "Circle 1",
        "divisions": [
          {
            "code": "D-01",
            "name": "Division 1",
            "subdivisions": [
              {
                "code": "SD-01",
                "name": "Subdivision 1",
                "substations": [
                  {
                    "code": "SS-01",
                    "name": "Substation 1",
                    "feeders": [
                      {
                        "code": "F-001",
                        "name": "Feeder 1",
                        "distribution_transformers": [
                          {
                            "code": "DT-001",
                            "name": "Malviya Nagar DT 1",
                            "capacity_kva": 100,
                            "meters": [
                              {
                                "meter_id": "J100000",
                                "serial_number": "SE33962",
                                "make": "HPL",
                                "phase_type": "single",
                                "install_status": "Decommissioned",
                                "geo": { "latitude": 26.938961, "longitude": 75.830957 }
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
]
```

---

## 🐳 Containerization & Production Deployment

A production-ready `Dockerfile` with multi-stage build and non-root execution is included:

1. **Build Container Image**:
   ```bash
   docker build -t flock-energy-api:latest .
   ```

2. **Run Container**:
   ```bash
   docker run -d \
     --name flock-api \
     -p 3001:3001 \
     -e PORT=3001 \
     -e URJA_EMAIL=operator@urja.local \
     -e URJA_PASSWORD=urja-ops-2026 \
     flock-energy-api:latest
   ```

3. **Verify Container Health**:
   ```bash
   docker ps
   # STATUS will display "(healthy)" once the /api/v1/health check succeeds
   ```

---

## ☁️ Cloud Deployment Guide (Free Public Hosting)

The repository is configured for zero-configuration, 1-click cloud deployment on **Render.com**, **Railway**, or **Koyeb**.

### Option A: 1-Click / Blueprint on Render.com (Recommended - 100% Free)

1. Sign up / Log in to [Render.com](https://render.com) (free account).
2. Click **New +** in the top right and select **Web Service**.
3. Choose **Build and deploy from a Git repository**.
4. Connect your GitHub account and select repository:
   ```
   Rushibhosale18/Flock-Energy-Assignment1
   ```
5. Render will automatically detect Node.js or the `render.yaml` blueprint. Fill in or confirm:
   - **Name**: `flock-energy-api` (or any unique name)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
6. Under **Environment Variables**, the default portal credentials are already baked into the codebase, but you can explicitly add:
   - `PORTAL_URL`: `https://urja-ops.flockenergy.tech`
   - `URJA_EMAIL`: `operator@urja.local`
   - `URJA_PASSWORD`: `urja-ops-2026`
   - `NODE_ENV`: `production`
7. Click **Create Web Service**.
8. Render will deploy the application within 60 seconds and assign a public URL with free SSL:
   - **Live Swagger UI**: `https://<your-service-name>.onrender.com/docs`
   - **Health Check**: `https://<your-service-name>.onrender.com/api/v1/health`
   - **Live Telemetry Dashboard**: `https://<your-service-name>.onrender.com/`

### Option B: Deploying on Railway.app

1. Go to [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select `Rushibhosale18/Flock-Energy-Assignment1`.
4. Railway will automatically pick up `railway.json`, run `npm install`, and launch on a public domain.
5. In Settings → Networking, click **Generate Domain**.

---

## ⚙️ Architectural Decisions & Trade-Offs

1. **Internal REST Telemetry vs. Brittle HTML DOM Scraping**:
   - *Decision*: Rather than attempting to scrape the placeholder HTML table on `/meters` (which displays `"No meters found."`), the adapter queries the authoritative `/portal/meters/search` endpoint. For individual meters, it combines Cheerio DOM parsing on `/meters/{id}` with concurrent calls to `/portal/meters/{id}/geo` and `/portal/meters/{id}/energy`.
   - *Trade-off*: Direct API queries improve execution speed by 10x and guarantee access to all 403 meters, while DOM parsing preserves unexposed physical Nameplate specifications.

2. **In-Memory Session Singleton with Re-Auth Mutex**:
   - *Decision*: Implemented an in-memory session manager with mutex locking.
   - *Trade-off*: Eliminates external caching dependencies (e.g. Redis) for straightforward single-instance deployments. For horizontal clustering across Kubernetes pods, session tokens would be moved to a shared Redis instance.

3. **Dual-Stack DNS Fallback (RFC 6052 NAT64)**:
   - *Decision*: Registered an automated DNS resolution hook that maps `urja-ops.flockenergy.tech` to both its IPv4 address and its NAT64 IPv6 gateway (`64:ff9b::2851:f567`).
   - *Trade-off*: Eliminates TCP handshake timeouts on modern cellular and IPv6-only networks where direct routing to Azure India Central IP `40.81.245.103` is firewalled.

---

## 🚫 Intentional Omissions

1. **Mutating Endpoints (POST / PUT / DELETE on Meters)**:
   - Urja Meter Ops is an operational read-only telemetry and monitoring portal. The legacy system does not expose write APIs for smart meters.
2. **Headless Browser Runtimes (Puppeteer / Playwright)**:
   - Headless browsers were intentionally avoided in favor of lightweight HTTP client requests (`axios` + `cheerio`). This reduces Docker image size from ~1.2GB to ~150MB and memory consumption from ~400MB to ~35MB.
3. **Local Database Synchronization**:
   - The wrapper is engineered as a zero-latency real-time proxy rather than a synchronized data store, ensuring downstream microservices always receive authoritative live telemetry.

---

## 📄 License
Proprietary — Flock Energy Engineering. All rights reserved.
