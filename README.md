# MetalPulse
 
Live metals spot prices and charts, plus email price alerts.
 
## Features
 
- **Metals prices** from Stooq (via the local scraper server).
- **ETFs quotes** in the UI (alerts for ETFs are not enabled yet).
- **Price alerts (email)**
  - Stored in Supabase Postgres
  - Checked by a background worker on an interval
  - Emails sent via Resend
 
## Project layout
 
- `src/` React (Vite) frontend
- `scraper-server.mjs` Metals scraper API (Stooq)
- `server/` Alerts backend
  - `api-server.ts` REST API for creating/listing/disabling alerts
  - `alerts-worker.ts` background worker that checks alerts and sends emails
  - `schema.sql` Supabase table definition
 
## Prerequisites
 
- Node.js 18+ (22+ recommended)
- A Supabase project
- A Resend account + verified sender
 
## Supabase setup (required for alerts)
 
1. Open your Supabase dashboard.
2. Go to **SQL Editor**.
3. Run the SQL in `server/schema.sql`.
 
This creates the `public.price_alerts` table that the API/worker uses.
 
## Environment variables
 
### Required for alerts API + worker
 
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ALERT_FROM_EMAIL` (must be a verified sender in Resend)
 
Optional:
 
- `ALERT_FROM_NAME`
- `ALERT_CHECK_INTERVAL_MS` (default `900000` = 15 minutes)
- `API_PORT` (default `8788`)
- `SCRAPER_PORT` (default `8787`)
 
## Local development
 
### 1) Frontend + metals scraper (no alerts)
 
Runs:
 
- Vite frontend: `http://127.0.0.1:8080`
- Scraper API: `http://127.0.0.1:8787`
 
```bash
npm run dev:all
```
 
### 2) Full alerts stack (API + worker + scraper + frontend)
 
This runs:
 
- Alerts API: `http://127.0.0.1:8788`
- Alerts worker (interval loop)
- Scraper server: `http://127.0.0.1:8787`
- Vite frontend: `http://127.0.0.1:8080`
 
```bash
npm run dev:alerts:stack
```
 
If `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are not set, the alerts API will respond with `503` and the worker will retry.
 
## API
 
### Create alert
 
`POST /api/alerts`
 
Body:
 
```json
{
  "email": "you@example.com",
  "assetType": "metal",
  "assetSymbol": "XAU",
  "direction": "above",
  "targetPrice": 2500
}
```
 
### List alerts
 
`GET /api/alerts?email=you@example.com`
 
### Disable alert
 
`DELETE /api/alerts/:id`
 
## Deployment notes
 
The alerts system needs **two long-running processes**:
 
- **Web/API process**: runs `server/api-server.ts`
- **Worker process**: runs `server/alerts-worker.ts`
 
On most platforms (including Railway) you deploy the same repo twice:
 
1. Service A (API): start command `npm run dev:api`
2. Service B (Worker): start command `npm run dev:worker`
 
Both services must have the same env vars configured (Supabase + Resend).
 