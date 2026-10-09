# Flock Energy - Urja Meter Ops API Wrapper

A clean, production-grade REST API wrapper around the legacy **Urja Meter Ops** smart-meter portal (`https://urja-ops.flockenergy.tech`). Built for the Flock Energy engineering take-home assignment.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Installation & Setup](#installation--setup)
5. [Running the Application](#running-the-application)
6. [API Endpoints & Documentation](#api-endpoints--documentation)
7. [Sample Requests & Responses](#sample-requests--responses)
8. [Authentication Approach](#authentication-approach)
9. [Design Decisions & Trade-offs](#design-decisions--trade-offs)
10. [Known Limitations](#known-limitations)
11. [Intentionally Skipped Features](#intentionally-skipped-features)
12. [Future Improvements](#future-improvements)
13. [Related Documentation](#related-documentation)

---

## Project Overview

The **Urja Meter Ops** portal is a legacy SvelteKit-based operations application that provides smart-meter listings, detailed device profiles, consumption intervals, and grid transformer topologies. 

This project provides an Express.js REST API that wraps the portal, manages session authentication transparently, hydrates complex legacy structures, and exposes clean, predictable JSON endpoints suitable for modern energy monitoring services and analytics platforms.

---

## Technology Stack

- **Runtime**: Node.js (v18+)
- **Language**: Plain JavaScript (CommonJS)
- **Web Framework**: Express.js 5.x
- **HTTP Client**: Axios with `tough-cookie` for session cookie persistence
- **Configuration**: `dotenv`
- **API Documentation**: OpenAPI 3.0.3 with Swagger UI via `swagger-ui-express`
- **Testing**: Jest and Supertest

---

## Project Structure

```
flock-energy-api/
├── src/
│   ├── config.js         # Environment variables & runtime settings
│   ├── index.js          # Express app initialization & server entry
│   ├── routes.js         # API endpoints, Swagger UI, & error handling
│   └── urjaClient.js     # Upstream portal HTTP client, session manager, & parsers
├── tests/
│   └── api.test.js       # Comprehensive mock & live integration test suite
├── .env.example          # Environment variable template
├── .gitignore            # Git exclusion rules
├── openapi.json          # OpenAPI 3.0.3 specification
├── package.json          # Node.js dependencies & scripts
├── PROTOCOL.md           # Reverse engineering notes & discovered protocol details
├── README.md             # Project documentation
└── REFLECTION.md         # Engineering reflection & retrospective
```

---

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd flock-energy-api
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Set your credentials in `.env`:
   ```ini
   PORT=3000
   URJA_BASE_URL=https://urja-ops.flockenergy.tech
   URJA_USERNAME=operator@urja.local
   URJA_PASSWORD=your_portal_password_here
   ```

---

## Running the Application

### Start the Server
```bash
npm start
```
The server will start on port `3000` (or the port defined in `PORT`).

### Run the Test Suite
- **Unit & Mock Tests (Offline, zero credentials required)**:
  ```bash
  npm test
  ```
- **Live Integration Tests (Runs against live Urja portal)**:
  ```bash
  npm run test:live
  ```
  *(Or execute `RUN_LIVE_TESTS=true npm test`)*

---

## API Endpoints & Documentation

Interactive API documentation is available via Swagger UI:
- **Swagger UI**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **OpenAPI Specification**: [http://localhost:3000/openapi.json](http://localhost:3000/openapi.json)

### Available Endpoints:
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check & uptime status |
| `GET` | `/api/v1/meters` | Paginated smart meter inventory with optional search (`q`, `page`) |
| `GET` | `/api/v1/meters/:id` | Detailed meter specifications, geographic coordinates, and hierarchy |
| `GET` | `/api/v1/meters/:id/consumption` | Time-series energy intervals (kWh, kVAh, voltage) |
| `GET` | `/api/v1/hierarchy` | Distribution transformers & grid topology |

---

## Sample Requests & Responses

### 1. Health Check
```bash
curl -X GET http://localhost:3000/health
```
**Response**:
```json
{
  "status": "ok",
  "uptime": 12.45,
  "timestamp": "2026-10-09T13:30:00.000Z"
}
```

### 2. List Meters (Paginated & Filterable)
```bash
curl -X GET "http://localhost:3000/api/v1/meters?q=HPL&page=1"
```
**Response**:
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
    }
  ],
  "pagination": {
    "total": 403,
    "page": 1,
    "pageSize": 20,
    "totalPages": 21
  }
}
```

### 3. Get Meter Details
```bash
curl -X GET http://localhost:3000/api/v1/meters/J100000
```
**Response**:
```json
{
  "meterId": "J100000",
  "serialNo": "SE33962",
  "make": "HPL",
  "phaseType": "single",
  "installStatus": "Decommissioned",
  "installationType": "Whole Current",
  "location": {
    "latitude": "26.938961002479868",
    "longitude": "75.83095696146852"
  },
  "hierarchy": {
    "zone": "Jaipur Zone 1 (Z-01)",
    "circle": "Circle 1 (C-01)",
    "division": "Division 1 (D-01)",
    "subdivision": "Subdivision 1 (SD-01)",
    "substation": "Substation 1 (SS-01)",
    "feeder": "Feeder 1 (F-001)",
    "dt": "Malviya Nagar DT 1 (DT-001)"
  }
}
```

### 4. Get Meter Consumption History
```bash
curl -X GET http://localhost:3000/api/v1/meters/J100000/consumption
```
**Response**:
```json
{
  "meterId": "J100000",
  "totalReadings": 337,
  "readings": [
    {
      "timestamp": "23/06/2026 23:30",
      "kwh": 48438.74,
      "kvah": 52313.84,
      "voltageR": 226
    },
    {
      "timestamp": "24/06/2026 00:00",
      "kwh": 48439.16,
      "kvah": 52314.29,
      "voltageR": 229
    }
  ]
}
```

### 5. Get Distribution Transformers Hierarchy
```bash
curl -X GET http://localhost:3000/api/v1/hierarchy
```
**Response**:
```json
{
  "transformers": [
    {
      "code": "DT-001",
      "name": "Malviya Nagar DT 1",
      "feederCode": "F-001",
      "capacityKva": 100
    },
    {
      "code": "DT-002",
      "name": "Mansarovar DT 2",
      "feederCode": "F-002",
      "capacityKva": 63
    }
  ]
}
```

---

## Authentication Approach

1. **Cookie Jar Integration**:
   - The portal relies on `better-auth` session cookies (`__Secure-better-auth.session_token`).
   - We utilize `tough-cookie` coupled with Axios interceptors to store, match domains, and inject session cookies into all outgoing requests.
2. **Transparent Auto-Reauthentication**:
   - The upstream session token expires after 1 hour (`Max-Age=3600`).
   - `urjaClient` wraps requests with an `executeWithAuth` handler. If any upstream request returns an HTTP `401 Unauthorized` or a redirect toward `/login`, the client triggers `login()`, acquires a new session cookie, and retries the original request once before failing.
3. **Credential Protection**:
   - All credentials remain strictly within `.env` and are never exposed across API responses, error payloads, or logs.

---

## Design Decisions & Trade-offs

- **Direct JSON Endpoints over HTML Scraping**:
  - Rather than fragile Cheerio-based scraping of SvelteKit HTML placeholders, we reverse-engineered the client bundle scripts to identify the internal JSON APIs (`/portal/meters/search`, `/portal/meters/:id/energy`, `/portal/meters/:id/geo`, `/portal/dts`).
  - *Trade-off*: SvelteKit internal URLs could change during major frontend refactors, but they provide significantly faster execution, cleaner data types, and avoid DOM parsing overhead.
- **Devalue Graph Hydration**:
  - SvelteKit encodes page data in an indexed, flattened devalue array. We implemented a lightweight recursive hydration algorithm (`unflattenDevalue`) that reconstructs the object graph cleanly without external dependencies.
- **No In-Memory Database**:
  - In alignment with requirements, the wrapper is stateless and read-only, reflecting the ground truth of the upstream portal.

---

## Known Limitations

- **Upstream Page Size**: The legacy portal hardcodes the page size to 20 records per page on `/portal/meters/search`.
- **Latency on Detail Calls**: Retrieving complete meter details requires querying both `/__data.json` (for parameters and electrical hierarchy) and `/portal/meters/:id/geo` (for coordinates).

---

## Intentionally Skipped Features

- **Mutation Endpoints**: The take-home assignment specifies treating the legacy portal as read-only. No meter decommissioning or parameter mutation endpoints were implemented.
- **Persistent Database Cache**: Kept the service stateless to prioritize simplicity and clean code over premature caching architecture.

---

## Future Improvements

- In-memory LRU cache with short TTL (5–10 minutes) for static distribution transformer topologies and meter profiles.
- Concurrency limiting to prevent rate-limiting when multiple clients crawl meter details simultaneously.
- Streaming CSV export endpoint (`GET /api/v1/meters/export`) mirroring the portal's client-side export capability.

---

## Related Documentation

- [PROTOCOL.md](file:///PROTOCOL.md) — Detailed reverse engineering observations, actual endpoints, schemas, and quirks.
- [REFLECTION.md](file:///REFLECTION.md) — Retrospective answering engineering assumptions, hurdles, mistakes, and areas for improvement.
- [openapi.json](file:///openapi.json) — Full OpenAPI 3.0.3 machine-readable API specification.
