import dotenv from "dotenv";
import path from "node:path";
import http from "node:http";
import { URL } from "node:url";
import { createSupabaseAdmin } from "./supabase";
import { createAlertSchema } from "./alerts";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

type Json = Record<string, unknown> | unknown[];

type PriceAlertInsert = {
  email: string;
  asset_type: "metal" | "etf";
  asset_symbol: string;
  direction: "above" | "below";
  target_price: number;
  is_active: boolean;
  last_is_condition_met: boolean | null;
};

type PriceAlertUpdate = Partial<Pick<PriceAlertInsert, "is_active" | "last_is_condition_met">>;

function sendJson(res: http.ServerResponse, statusCode: number, payload: Json) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

const METALS_STOOQ_SYMBOL_MAP: Record<string, string> = {
  XAU: "xauusd",
  XAG: "xagusd",
  XPT: "xptusd",
  XPD: "xpdusd",
};

type CacheEntry = { ts: number; value: string };
const stooqCache = new Map<string, CacheEntry>();
const STOOQ_CACHE_TTL_MS = Number.parseInt(process.env.STOOQ_CACHE_TTL_MS || "1800000", 10);

function parseStooqCsv(text: string): Array<{ date: string; close: number }> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = lines[0] ?? "";
  const delimiter = header.includes(";") ? ";" : ",";
  const cols = header.split(delimiter).map((c) => c.trim().toLowerCase());

  const idxDate = cols.indexOf("date");
  const idxClose = cols.indexOf("close");
  if (idxDate === -1 || idxClose === -1) return [];

  const rows: Array<{ date: string; close: number }> = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(delimiter);
    const date = parts[idxDate]?.trim();
    const closeRaw = parts[idxClose]?.trim();
    const close = Number.parseFloat(closeRaw ?? "");

    if (!date || !Number.isFinite(close) || close <= 0) continue;
    rows.push({ date, close });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

async function fetchTextCached(cacheKey: string, url: string): Promise<string> {
  const now = Date.now();
  const cached = stooqCache.get(cacheKey);
  if (cached && now - cached.ts < STOOQ_CACHE_TTL_MS) {
    return cached.value;
  }

  const r = await fetch(url, {
    headers: {
      "user-agent": "MetalPulse/1.0",
    },
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Upstream fetch failed ${r.status} ${r.statusText}: ${t}`);
  }

  const text = await r.text();
  stooqCache.set(cacheKey, { ts: now, value: text });
  return text;
}

async function getStooqSeries(stooqSymbol: string, limit: number): Promise<Array<{ date: string; close: number }>> {
  const l = Math.max(2, Math.min(limit, 400));
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d&l=${l}`;
  const text = await fetchTextCached(`series:${stooqSymbol}:${l}`, url);
  return parseStooqCsv(text);
}

function toChartPoints(rows: Array<{ date: string; close: number }>): Array<{ date: string; price: number }> {
  return rows.map((r) => {
    const date = new Date(r.date);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: Math.round(r.close * 100) / 100,
    };
  });
}

const PORT = Number.parseInt(process.env.API_PORT || process.env.PORT || "8788", 10);
let supabase: any = null;
let supabaseInitError: string | null = null;
try {
  supabase = createSupabaseAdmin();
} catch (e) {
  supabaseInitError = e instanceof Error ? e.message : String(e);
  console.warn(`Alerts API running without Supabase configured: ${supabaseInitError}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);

    if (requestUrl.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (requestUrl.pathname === "/api/metals" && req.method === "GET") {
      const days = 30;
      const promises = Object.entries(METALS_STOOQ_SYMBOL_MAP).map(async ([symbol, stooqSymbol]) => {
        const rows = await getStooqSeries(stooqSymbol, days + 2);
        if (rows.length < 2) {
          throw new Error(`Not enough data points for ${symbol}`);
        }

        const last = rows[rows.length - 1]!;
        const prev = rows[rows.length - 2]!;

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

    const metalsHistory = requestUrl.pathname.match(/^\/api\/metals\/(XAU|XAG|XPT|XPD)\/history$/i);
    if (metalsHistory && req.method === "GET") {
      const symbol = metalsHistory[1]!.toUpperCase();
      const stooqSymbol = METALS_STOOQ_SYMBOL_MAP[symbol];
      if (!stooqSymbol) return sendJson(res, 404, { error: "Unknown metal symbol" });

      const days = Number.parseInt(requestUrl.searchParams.get("days") || "30", 10);
      const safeDays = Number.isFinite(days) ? Math.max(2, Math.min(days, 365)) : 30;

      const rows = await getStooqSeries(stooqSymbol, safeDays + 1);
      const points = toChartPoints(rows.slice(Math.max(rows.length - (safeDays + 1), 0)));
      return sendJson(res, 200, points);
    }

    if (requestUrl.pathname.startsWith("/api/alerts") && !supabase) {
      return sendJson(res, 503, {
        error: "Alerts backend is not configured",
        details: supabaseInitError ?? "Missing Supabase env vars",
      });
    }

    if (requestUrl.pathname === "/api/alerts" && req.method === "POST") {
      const body = await readJsonBody(req);
      const parsed = createAlertSchema.safeParse(body);
      if (!parsed.success) {
        return sendJson(res, 400, { error: "Invalid payload", details: parsed.error.flatten() });
      }

      const { email, assetType, assetSymbol, direction, targetPrice } = parsed.data;

      const { data, error } = await supabase
        .from("price_alerts")
        .insert({
          email,
          asset_type: assetType,
          asset_symbol: assetSymbol.toUpperCase(),
          direction,
          target_price: targetPrice,
          is_active: true,
          last_is_condition_met: null,
        } satisfies PriceAlertInsert)
        .select("id, email, asset_type, asset_symbol, direction, target_price, is_active")
        .single();

      if (error) {
        return sendJson(res, 500, { error: error.message });
      }

      return sendJson(res, 201, { alert: data });
    }

    if (requestUrl.pathname === "/api/alerts" && req.method === "GET") {
      const email = requestUrl.searchParams.get("email");
      if (!email) {
        return sendJson(res, 400, { error: "Missing email query param" });
      }

      const { data, error } = await supabase
        .from("price_alerts")
        .select("id, email, asset_type, asset_symbol, direction, target_price, is_active, created_at")
        .eq("email", email)
        .order("created_at", { ascending: false });

      if (error) {
        return sendJson(res, 500, { error: error.message });
      }

      return sendJson(res, 200, { alerts: data ?? [] });
    }

    const del = requestUrl.pathname.match(/^\/api\/alerts\/([0-9a-f-]{36})$/i);
    if (del && req.method === "DELETE") {
      const id = del[1]!;

      const { error } = await supabase
        .from("price_alerts")
        .update({ is_active: false } satisfies PriceAlertUpdate)
        .eq("id", id);

      if (error) {
        return sendJson(res, 500, { error: error.message });
      }

      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
