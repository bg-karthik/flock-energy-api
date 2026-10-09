# Urja Meter Ops Reverse Engineering & Protocol Documentation

This document records the empirical findings from reverse-engineering the **Urja Meter Ops** legacy smart-meter portal (`https://urja-ops.flockenergy.tech`). It documents observed HTTP methods, authentication flows, internal endpoints, serialization formats, pagination behavior, and quirks.

---

## 1. Authentication Flow

### Observations
- **Endpoint**: `POST /login`
- **Request Format**: `application/x-www-form-urlencoded`
- **Payload**:
  ```http
  POST /login HTTP/1.1
  Host: urja-ops.flockenergy.tech
  Content-Type: application/x-www-form-urlencoded
  Origin: https://urja-ops.flockenergy.tech

  email=operator%40urja.local&password=your_password_here
  ```
- **Response**:
  - Status: `200 OK` (returning JSON redirect descriptor: `{"type":"redirect","status":303,"location":"/meters"}`).
  - Set-Cookie Header:
    ```http
    Set-Cookie: __Secure-better-auth.session_token=<token>; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax
    ```
- **Session Mechanism**:
  - The portal utilizes `better-auth` for session management.
  - The session token has a lifespan of 1 hour (`Max-Age=3600`).
  - Active session details can be inspected at `GET /api/auth/get-session`, which returns user profile and session expiration metadata.
- **Session Expiration / Unauthenticated Requests**:
  - When accessing protected routes without a valid session cookie, the server issues an HTTP `302 Found` or `303 See Other` redirect to `/login`.
  - API endpoints (e.g. `/portal/meters/...`) return HTTP `401 Unauthorized` or redirect if the session cookie is missing or invalid.

### Assumptions vs Observations
- *Observed*: Login requires form-encoded `email` and `password`, sets `__Secure-better-auth.session_token`, and expires after 3600 seconds.
- *Assumption*: Session refresh tokens or remember-me extensions are not used by the portal; re-authentication is performed directly with the stored operator credentials upon detecting expired session cookies.

---

## 2. Portal Architecture & Data Surface

### Observations
- **Framework**: The portal is built with **SvelteKit** using Vite and SSR (Server-Side Rendering).
- **Navigation Routes**:
  - `/meters`: Main meter inventory table.
  - `/meters/[id]`: Individual meter detail and consumption inspection page.
  - `/transformers`: Distribution transformers inventory.
  - `/login`: Operator login form.
- **Client Bundles**:
  - SSR HTML embeds client-side hydration scripts from `/_app/immutable/nodes/...`.
  - Investigating bundle `5.C4dYcCRt.js` (Meters view) and `6.l777LXKL.js` (Meter Detail view) revealed the internal `/portal/...` REST endpoints used by the portal's client-side code.

---

## 3. Discovered Internal Endpoints

### 3.1 Meter Search & Inventory: `GET /portal/meters/search`
- **URL**: `GET /portal/meters/search?q={query}&page={page}`
- **Authentication**: Requires `__Secure-better-auth.session_token` cookie.
- **Query Parameters**:
  - `q`: Search string (filters by meter ID, serial number, make). Defaults to empty string.
  - `page`: Page index (1-based integer).
- **Observed Response Schema**:
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
    "total": 403,
    "page": 1,
    "pageSize": 20
  }
  ```
- **Pagination Details**:
  - The dataset contains 403 smart meters across 21 pages.
  - Page size is fixed upstream to 20 records per page.

### 3.2 Meter Specifications & Hierarchy: `GET /meters/{id}/__data.json`
- **URL**: `GET /meters/{id}/__data.json`
- **Header Required**: `x-sveltekit-invalidated: 010`
- **Serialization Format**: SvelteKit `devalue` indexed object array.
- **Hydrated Structure**:
  - `detail.data`: Array of parameter objects:
    - Meter ID (e.g. `J100000`)
    - Serial No (e.g. `SE33962`)
    - Make (e.g. `HPL`, `L&T`, `Genus`, `Allied`, `Secure`)
    - Phase Type (`single` or `three`)
    - Installation Status (`Installed`, `Decommissioned`, `Faulty`)
    - Installation Type (`Whole Current`, `CT Operated`)
  - `hierarchy`: Grid topological hierarchy:
    - Zone (`Jaipur Zone 1 (Z-01)`)
    - Circle (`Circle 1 (C-01)`)
    - Division (`Division 1 (D-01)`)
    - Subdivision (`Subdivision 1 (SD-01)`)
    - Sub Station (`Substation 1 (SS-01)`)
    - Feeder (`Feeder 1 (F-001)`)
    - DT (`Malviya Nagar DT 1 (DT-001)`)
- **Missing / Invalid Meter**:
  - When `{id}` does not exist, the response contains `{"type":"error","error":{"message":"Meter not found"},"status":404}`.

### 3.3 Meter Geographic Coordinates: `GET /portal/meters/{id}/geo`
- **URL**: `GET /portal/meters/{id}/geo`
- **Observed Response Schema**:
  ```json
  {
    "data": {
      "latitude": "26.938961002479868",
      "longitude": "75.83095696146852"
    }
  }
  ```
- **Error Response**:
  - Returns `404 Not Found` with `{"error":"not_found","message":"Meter not found"}` if the meter is missing.

### 3.4 Meter Energy Consumption Time-Series: `GET /portal/meters/{id}/energy`
- **URL**: `GET /portal/meters/{id}/energy`
- **Observed Response Schema**:
  ```json
  {
    "data": [
      {
        "timestamp": "23/06/2026 23:30",
        "kwh": "48438.74",
        "kvah": "52313.84",
        "voltR": "226"
      }
    ]
  }
  ```
- **Observations**:
  - Returns 30-minute interval readings for smart meters over a 7-day period. Because the query window is inclusive of both boundary timestamps (e.g. from `23/06/2026 23:30` through `30/06/2026 23:30`), the array contains exactly 337 readings (7 days × 48 intervals/day + 1 initial boundary point).
  - Energy (`kwh`, `kvah`) and voltage (`voltR`) values are returned as string numbers in the legacy payload. The wrapper normalizes these into numerical values.
  - Returns `404 Not Found` with `{"error":"not_found","message":"Meter not found"}` if the meter does not exist.

### 3.5 Distribution Transformers: `GET /portal/dts`
- **URL**: `GET /portal/dts`
- **Observed Response Schema**:
  ```json
  {
    "data": [
      {
        "code": "DT-001",
        "name": "Malviya Nagar DT 1",
        "feederCode": "F-001",
        "capacityKva": 100
      }
    ]
  }
  ```
- **Observations**:
  - Lists the distribution transformers with transformer code, readable name, feeder code, and capacity in kVA.

---

## 4. Discovered Quirks and Engineering Solutions

1. **SvelteKit SSR vs Client-Side Endpoints**:
   - Initial inspections of HTML routes (`/meters`, `/transformers`) showed empty table placeholders because data is fetched by SvelteKit's client bundle or through SvelteKit data loaders.
   - Disassembling bundle scripts revealed the direct `/portal/...` REST endpoints, permitting low-latency, structured JSON retrieval instead of fragile DOM parsing.

2. **SvelteKit `devalue` Encoding**:
   - SvelteKit's `__data.json` endpoints return flattened devalue arrays where indices point to cyclic and complex object references.
   - We implemented an `unflattenDevalue` recursive hydration algorithm to transform the index graph into standard JavaScript objects cleanly.

3. **Session Expiry & Re-authentication**:
   - The session token expires after 60 minutes.
   - `urjaClient` handles session invalidation with automatic re-authentication: if any upstream call receives a 401 status or login redirect, the client authenticates once and transparently retries the request.
