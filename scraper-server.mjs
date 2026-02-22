import http from "node:http";
import { URL } from "node:url";

const PORT = Number.parseInt(process.env.SCRAPER_PORT || "8787", 10);
const CACHE_TTL_MS = Number.parseInt(process.env.SCRAPER_CACHE_TTL_MS || "1800000", 10);

const symbolMap = {
  XAU: "xauusd",
  XAG: "xagusd",
  XPT: "xptusd",
  XPD: "xpdusd",
};

/** @type {Map<string, { ts: number; value: any }> } */
const cache = new Map();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseStooqCsv(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = lines[0];
  const delimiter = header.includes(";") ? ";" : ",";
  const cols = header.split(delimiter).map((c) => c.trim().toLowerCase());

  const idxDate = cols.indexOf("date");
  const idxClose = cols.indexOf("close");

  if (idxDate === -1 || idxClose === -1) return [];

  const rows = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(delimiter);
    const date = parts[idxDate]?.trim();
    const closeRaw = parts[idxClose]?.trim();
    const close = Number.parseFloat(closeRaw);

    if (!date || !Number.isFinite(close) || close <= 0) continue;
    rows.push({ date, close });
  }

  // Stooq usually returns oldest-first for /q/d/l, but we sort to be safe.
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

async function fetchTextCached(cacheKey, url) {
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const res = await fetch(url, {
    headers: {
      "user-agent": "MetalPulse/1.0 (local dev)",
    },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Upstream fetch failed ${res.status} ${res.statusText}: ${t}`);
  }

  const text = await res.text();
  cache.set(cacheKey, { ts: now, value: text });
  return text;
}

async function getSeries(stooqSymbol, limit) {
  const l = Math.max(2, Math.min(limit, 400));
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d&l=${l}`;
  const text = await fetchTextCached(`series:${stooqSymbol}:${l}`, url);
  return parseStooqCsv(text);
}

function toChartPoints(rows) {
  return rows.map((r) => {
    const date = new Date(r.date);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: Math.round(r.close * 100) / 100,
    };
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    if (requestUrl.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (requestUrl.pathname === "/api/metals") {
      const days = 30;
      const promises = Object.entries(symbolMap).map(async ([symbol, stooqSymbol]) => {
        const rows = await getSeries(stooqSymbol, days + 2);
        if (rows.length < 2) {
          throw new Error(`Not enough data points for ${symbol}`);
        }

        const last = rows[rows.length - 1];
        const prev = rows[rows.length - 2];

        const price = last.close;
        const change = price - prev.close;
        const changePercent = prev.close > 0 ? (change / prev.close) * 100 : 0;

        const prices = rows.map((r) => r.close).filter((p) => Number.isFinite(p) && p > 0);
        const high = prices.length ? Math.max(...prices) : price;
        const low = prices.length ? Math.min(...prices) : price;

        return {
          id:
            symbol === "XAU"
              ? "gold"
              : symbol === "XAG"
                ? "silver"
                : symbol === "XPT"
                  ? "platinum"
                  : "palladium",
          name:
            symbol === "XAU"
              ? "Gold"
              : symbol === "XAG"
                ? "Silver"
                : symbol === "XPT"
                  ? "Platinum"
                  : "Palladium",
          symbol,
          price: Math.round(price * 100) / 100,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          high24h: Math.round(high * 100) / 100,
          low24h: Math.round(low * 100) / 100,
          effectiveDate: last.date,
        };
      });

      const results = await Promise.all(promises);
      return sendJson(res, 200, results);
    }

    const m = requestUrl.pathname.match(/^\/api\/metals\/(XAU|XAG|XPT|XPD)\/history$/i);
    if (m) {
      const symbol = m[1].toUpperCase();
      const stooqSymbol = symbolMap[symbol];
      if (!stooqSymbol) return sendJson(res, 404, { error: "Unknown metal symbol" });

      const days = Number.parseInt(requestUrl.searchParams.get("days") || "30", 10);
      const safeDays = Number.isFinite(days) ? Math.max(2, Math.min(days, 365)) : 30;

      const rows = await getSeries(stooqSymbol, safeDays + 1);
      const points = toChartPoints(rows.slice(Math.max(rows.length - (safeDays + 1), 0)));
      return sendJson(res, 200, points);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Scraper server listening on http://localhost:${PORT}`);
});
