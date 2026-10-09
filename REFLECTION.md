# Engineering Reflection

> **Note for Candidate**: This document reflects the technical journey, challenges, trade-offs, and design decisions encountered during the implementation of the Urja Meter Ops wrapper. Review and personalize any points as needed before final submission.

## 1. What assumptions did I make?
- **Portal Endpoint Architecture**: Initially, I assumed the portal was a traditional monolithic server that would render all table rows directly into the initial HTML document or serve a standard public JSON API at `/api/meters` or `/meters.json`. In reality, Urja Meter Ops is a SvelteKit hybrid application that pairs server-rendered layouts with internal JSON endpoints under `/portal/*`.
- **Session Lifespan & Renewal**: I assumed session renewal might require a dedicated refresh token endpoint or OAuth flow. Investigation showed that `better-auth` uses a single session cookie (`__Secure-better-auth.session_token`) with a 1-hour expiration, which requires re-authenticating with the portal credentials upon expiration.
- **Devalue Serialization Consistency**: I assumed that SvelteKit's `/__data.json` endpoint would return standard JSON. It actually returns SvelteKit's indexed `devalue` serialization format, requiring an un-flattening algorithm to reconstruct the nested object trees.

---

## 2. Which part was most difficult, and how did I get unstuck?
- **Locating the Actual Meter Inventory Data**: When fetching `/meters` via HTTP, the returned HTML contained "0 total" and "No meters found" in the table body, despite the browser session displaying 403 meters.
  - *How I got unstuck*: I inspected the SvelteKit compiled bundle files (`5.C4dYcCRt.js` and `6.l777LXKL.js`) loaded by the page. Searching for fetch invocations revealed the internal `/portal/meters/search?q=` and `/portal/meters/{id}/energy` endpoints, which directly return full JSON data rather than relying on brittle HTML scraping.
- **Handling SvelteKit `devalue` Serialization**:
  - The meter specifications and grid hierarchy were encoded as an array of index pointers (`node[2].data`).
  - *How I got unstuck*: I wrote a recursive hydration function (`unflattenDevalue`) that maps integer index references back to their concrete string and object definitions, resulting in clean, predictable JavaScript dictionaries.

---

## 3. What would I improve with another day?
- **In-Memory Caching with TTL**: The upstream portal's distribution transformers (`/portal/dts`) and static meter metadata rarely change. Adding an in-memory cache (e.g. 5–15 minute TTL) would significantly decrease the volume of upstream HTTP calls and improve response times.
- **Rate Limiting & Concurrency Controls**: When requests are made for meter details and consumption simultaneously, rate limiting at the API layer would protect the legacy portal from sudden traffic spikes.
- **Streaming Bulk Export**: The portal includes an "Export all meters" function on `/transformers` that generates a CSV client-side. Providing a streaming `GET /api/v1/meters/export` endpoint that buffers paginated results to CSV or newline-delimited JSON would be valuable for analytical workloads.

---

## 4. What mistake did I make?
- **Initial Module Compatibility with Jest**: When installing `axios-cookiejar-support`, I initially installed version 7 without verifying that it is distributed purely as an ES Module (ESM). When running Jest in CommonJS mode, Jest refused to load the ESM module via `require()`.
- *Correction*: Rather than relying on fragile ESM transforms or extra compilation overhead, I leveraged `tough-cookie` directly with standard Axios request/response interceptors. This eliminated the third-party wrapper dependency, resolved the Jest compatibility issue completely, and kept the code clean and transparent.

---

## 5. What would I criticise about my own submission?
- **Two Upstream Calls for Meter Detail**: To construct the full meter profile on `GET /api/v1/meters/:id`, the client performs two requests: one to `/meters/:id/__data.json` (for parameters and hierarchy) and one to `/portal/meters/:id/geo` (for coordinates). While this provides complete and accurate data, executing them in parallel or providing a query option to omit geo-coordinates would optimize throughput for clients that only need grid hierarchy.
- **Fixed Page Size Upstream**: The upstream portal fixes the search page size to 20 records. While our wrapper reports this clearly in the pagination response, exposing a virtual pagination layer that fetches consecutive pages to satisfy larger client `limit` requests would improve flexibility.
