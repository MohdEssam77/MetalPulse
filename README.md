# MetalPulse

Real-time precious metals dashboard with live spot prices, ETF tracking, price alerts, market news, and an AI-powered market analyst chat.

🚀 **Live demo**: https://metalpulse-production-941e.up.railway.app

## Features

- Live spot prices for Gold (XAU), Silver (XAG), Platinum (XPT), Palladium (XPD)
- 30-day historical charts (Stooq daily closes)
- Popular metal ETFs with live quotes (GLD, SLV, PPLT, PALL, GDX, GDXJ)
- Price alerts — get emailed when a metal or ETF crosses your target price
- Market news — auto-refreshing feed from Google News & Mining.com, filtered to precious metals
- AI chat — Gemini-powered analyst with access to live news headlines; supports your own API key
- USD/EUR currency toggle
- Dark/light theme
- Mobile-friendly PWA (installable)

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + TanStack Query
- **Backend**: Node.js HTTP server (`tsx`, no Express)
- **Price sources**: Stooq (primary) → Twelve Data → GoldAPI → MetalpriceAPI
- **ETFs**: Twelve Data
- **News**: Google News RSS + Mining.com RSS (30-min server-side cache)
- **AI**: Google Gemini (`gemini-2.5-flash`)
- **Alerts DB**: Supabase (PostgreSQL)
- **Email**: SendGrid / Resend / Nodemailer
- **Deployment**: Railway

## Project Structure

```
metalpulse/
├── src/
│   ├── components/        # Navbar, MetalCard, ETFTable, NewsSection, AiChatWidget, …
│   ├── hooks/             # use-metals, use-etfs, use-news, use-currency-rate, …
│   ├── lib/               # API client, currency helpers, metals static data
│   └── pages/             # Index.tsx
├── server/
│   ├── api-server.ts      # Main API server (port 8788)
│   └── alerts-worker.ts   # Background worker — polls prices and sends alert emails
├── scraper-server.mjs     # Lightweight Stooq scraper (port 8787)
└── .env                   # Environment variables
```

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
git clone <repo-url>
cd metalpulse
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Supabase (price alerts)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Twelve Data (ETF quotes + spot prices fallback)
TWELVEDATA_API_KEY=your_twelvedata_key

# Google Gemini (AI chat) — free key at https://aistudio.google.com/apikey
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash   # optional, this is the default

# Email (pick one)
SENDGRID_API_KEY=your_sendgrid_key
RESEND_API_KEY=your_resend_key

# Alert email sender
ALERT_FROM_EMAIL=your_verified_sender@example.com
ALERT_FROM_NAME=MetalPulse Alerts

# Optional: fallback metal price APIs
VITE_GOLDAPI_API_KEY=your_goldapi_key
VITE_METALPRICE_API_KEY=your_metalprice_key

# Optional: cache TTLs (milliseconds)
STOOQ_CACHE_TTL_MS=1800000
SPOT_CACHE_TTL_MS=300000
NEWS_CACHE_TTL_MS=1800000
ALERT_CHECK_INTERVAL_MS=900000
```

### Development

```bash
# Run everything — API + worker + scraper + Vite dev server (recommended)
npm run dev:alerts:stack

# Or run individually:
npm run dev           # Vite frontend (http://localhost:5173)
npm run dev:api       # API server   (http://localhost:8788)
npm run dev:scraper   # Stooq scraper (http://localhost:8787)
npm run dev:worker    # Alerts worker
```

### Build

```bash
npm run build
npm start             # Serves built frontend + API on port 8788
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/metals` | Live spot prices for XAU, XAG, XPT, XPD |
| `GET` | `/api/metals/:symbol/history?days=N` | Historical daily closes |
| `GET` | `/api/etfs` | Live ETF quotes |
| `GET` | `/api/news` | Latest metals news (cached 30 min) |
| `POST` | `/api/alerts` | Create a price alert |
| `GET` | `/api/alerts?email=` | List alerts by email |
| `DELETE` | `/api/alerts/:id` | Deactivate an alert |
| `POST` | `/api/ai/chat` | AI chat — body: `{ messages, apiKey? }` |

## Deployment (Railway)

### Services

1. **API Service** (public domain)
   - Start: `npm run start:api`
   - Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWELVEDATA_API_KEY`, `GEMINI_API_KEY`

2. **Worker Service** (private, no domain needed)
   - Start: `npm run start:worker`
   - Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SENDGRID_API_KEY` (or `RESEND_API_KEY`), `ALERT_FROM_EMAIL`, `ALERT_FROM_NAME`

3. **Scraper Service** (optional — can be merged into API)
   - Start: `npm run start:scraper`

Railway injects `PORT` automatically; the API server listens on it.

## AI Chat

The chat uses Google Gemini. A default key can be set server-side via `GEMINI_API_KEY`. Users can also bring their own key through the **"Your API"** button in the chat widget — it is stored only in their browser and sent directly to Google.

The AI has access to the current news cache, so it can reference live headlines and links when answering questions about market news.


## Contributing

1. Fork the repository
2. Create a feature branch
3. Open a PR
