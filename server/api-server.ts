import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
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

function sendText(res: http.ServerResponse, statusCode: number, body: string, contentType: string) {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
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

type AiChatMessage = { role: "user" | "assistant"; content: string };

function getGeminiApiKey(bodyKey: unknown): string | null {
  if (typeof bodyKey === "string" && bodyKey.trim()) return bodyKey.trim();
  const envKey = process.env.GEMINI_API_KEY;
  if (typeof envKey === "string" && envKey.trim()) return envKey.trim();
  return null;
}

async function callGeminiChat(params: {
  apiKey: string;
  messages: AiChatMessage[];
}): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const systemInstruction =
    "You are a data analyst and investing expert focused on precious metals (XAU, XAG, XPT, XPD) and metal ETFs (GLD, SLV, PPLT, PALL, GDX, GDXJ). Provide clear, structured analysis and practical suggestions, but do not present it as financial advice. You do not have live browsing in this chat. If the user asks about recent news, ask them to paste headlines/links and then analyze how that news could affect prices and sentiment. Use cautious language, mention uncertainty, and suggest risk management considerations.";

  const contents = params.messages
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 800,
      },
    }),
  });

  const text = await r.text().catch(() => "");
  if (!r.ok) {
    throw new Error(`Gemini error ${r.status}: ${text || r.statusText}`);
  }

  const json: any = text ? JSON.parse(text) : null;
  const reply =
    json?.candidates?.[0]?.content?.parts
      ?.map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("") ??
    "";

  return String(reply || "").trim();
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

type SpotSnapshot = { price: number; ts: number };
const spotCache = new Map<string, SpotSnapshot>();
const SPOT_CACHE_TTL_MS = Number.parseInt(process.env.SPOT_CACHE_TTL_MS || "300000", 10);

type NewsArticle = {
  title: string;
  summary: string;
  link: string;
  source: string;
  publishedAt: string;
};

type NewsCache = { ts: number; articles: NewsArticle[] };
let newsCache: NewsCache | null = null;
const NEWS_CACHE_TTL_MS = Number.parseInt(process.env.NEWS_CACHE_TTL_MS || "1800000", 10);

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(raw: string): string {
  // Decode entities first so entity-encoded tags like &lt;a&gt; also get stripped
  const decoded = decodeEntities(raw);
  return decoded.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function extractRssTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  return m ? m[1]!.trim() : "";
}

const NEWS_RSS_FEEDS = [
  // Google News — recent articles only (within 3 days), sorted by date
  {
    url: "https://news.google.com/rss/search?q=gold+silver+precious+metals+price+when:3d&hl=en-US&gl=US&ceid=US:en",
    source: "Google News",
  },
  {
    url: "https://www.mining.com/feed/",
    source: "Mining.com",
  },
];

async function fetchRssFeed(url: string, sourceName: string): Promise<NewsArticle[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MetalPulse/1.0; +https://metalpulse.app)" },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`RSS ${r.status} from ${url}`);
    const xml = await r.text();
    const items = xml.split("<item>").slice(1);
    return items.slice(0, 20).map((item) => {
      const title = stripHtml(extractRssTag(item, "title"));
      const description = stripHtml(extractRssTag(item, "description"));
      const rawLink = extractRssTag(item, "link").trim();
      const pubDate = extractRssTag(item, "pubDate").trim();
      // Use description as summary only if it has meaningful text (not just a link)
      const summary = description.length > 30 && !description.startsWith("http")
        ? (description.length > 220 ? description.slice(0, 220).replace(/\s+\S*$/, "") + "…" : description)
        : "";
      const sourceTag = stripHtml(extractRssTag(item, "source")).trim() || sourceName;
      return {
        title,
        summary,
        link: rawLink,
        source: sourceTag,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      };
    }).filter((a) => a.title && a.link);
  } finally {
    clearTimeout(timer);
  }
}

async function getNews(): Promise<NewsArticle[]> {
  const now = Date.now();
  if (newsCache && now - newsCache.ts < NEWS_CACHE_TTL_MS) return newsCache.articles;

  let articles: NewsArticle[] = [];
  for (const feed of NEWS_RSS_FEEDS) {
    try {
      const fetched = await fetchRssFeed(feed.url, feed.source);
      if (fetched.length > 0) {
        articles = fetched;
        break;
      }
    } catch (e) {
      console.warn(`[news] Feed failed (${feed.url}):`, e instanceof Error ? e.message : e);
    }
  }

  if (articles.length === 0) throw new Error("All news feeds failed");

  // Sort newest first
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  newsCache = { ts: now, articles };
  return articles;
}

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

async function fetchTwelveDataSpotPricesUsd(symbols: string[]): Promise<Record<string, number>> {
  const apiKey =
    process.env.TWELVEDATA_API_KEY || process.env.VITE_TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TWELVEDATA_API_KEY");
  }

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(","))}&apikey=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    headers: {
      "user-agent": "MetalPulse/1.0",
    },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Twelve Data fetch failed: ${r.status} ${r.statusText} - ${t}`);
  }

  const json: any = await r.json();
  if (json?.status === "error") {
    throw new Error(`Twelve Data error: ${String(json?.message ?? "unknown")}`);
  }

  const out: Record<string, number> = {};
  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const [symbol, payload] of Object.entries(json)) {
      if (!payload || typeof payload !== "object") continue;
      const priceRaw = (payload as any).price ?? (payload as any).close ?? (payload as any).last;
      const price = Number.parseFloat(String(priceRaw ?? ""));
      if (!Number.isFinite(price) || price <= 0) continue;
      out[String(symbol).toUpperCase()] = Math.round(price * 100) / 100;
    }
  }

  const missing = symbols.filter((s) => !Number.isFinite(out[s]));
  if (missing.length > 0) {
    throw new Error(`Twelve Data returned missing/invalid prices for: ${missing.join(",")}`);
  }

  return out;
}

async function getSpotPriceUsd(symbol: string, fallbackClose: number): Promise<number> {
  const now = Date.now();
  const cached = spotCache.get(symbol);
  if (cached && now - cached.ts < SPOT_CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    const prices = await fetchTwelveDataSpotPricesUsd([symbol]);
    const price = prices[symbol];
    if (Number.isFinite(price) && price > 0) {
      spotCache.set(symbol, { price, ts: now });
      return price;
    }
  } catch {
    // fall back
  }

  spotCache.set(symbol, { price: fallbackClose, ts: now });
  return fallbackClose;
}

type EtfQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
};

const ETF_SYMBOLS: Array<{ symbol: string; name: string }> = [
  { symbol: "GLD", name: "SPDR Gold Shares" },
  { symbol: "SLV", name: "iShares Silver Trust" },
  { symbol: "PPLT", name: "abrdn Platinum ETF" },
  { symbol: "PALL", name: "abrdn Palladium ETF" },
  { symbol: "GDX", name: "VanEck Gold Miners" },
  { symbol: "GDXJ", name: "VanEck Junior Gold Miners" },
];

async function fetchEtfQuotesFromTwelveData(): Promise<EtfQuote[]> {
  const apiKey =
    process.env.TWELVEDATA_API_KEY || process.env.VITE_TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TWELVEDATA_API_KEY");
  }

  const baseUrl = "https://api.twelvedata.com";

  const quotes = await Promise.all(
    ETF_SYMBOLS.map(async (etf) => {
      const url = `${baseUrl}/quote?symbol=${encodeURIComponent(etf.symbol)}&apikey=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url, {
        headers: {
          "user-agent": "MetalPulse/1.0",
        },
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`Twelve Data fetch failed for ${etf.symbol}: ${r.status} ${r.statusText} - ${t}`);
      }

      const data: any = await r.json();
      if (data?.status === "error" || data?.code) {
        throw new Error(`Twelve Data error for ${etf.symbol}: ${String(data?.message ?? data?.info ?? "unknown")}`);
      }

      const price = Number.parseFloat(String(data?.close ?? data?.price ?? data?.last ?? ""));
      const change = Number.parseFloat(String(data?.change ?? "0"));
      const changePercent = Number.parseFloat(String(data?.percent_change ?? data?.change_percent ?? "0"));

      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Twelve Data returned invalid price for ${etf.symbol}`);
      }

      return {
        symbol: etf.symbol,
        name: (typeof data?.name === "string" && data.name) || etf.name,
        price: Math.round(price * 100) / 100,
        change: Number.isFinite(change) ? Math.round(change * 100) / 100 : 0,
        changePercent: Number.isFinite(changePercent) ? Math.round(changePercent * 100) / 100 : 0,
      } satisfies EtfQuote;
    }),
  );

  return quotes;
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
const DIST_DIR = path.resolve(process.cwd(), "dist");
const INDEX_HTML_PATH = path.join(DIST_DIR, "index.html");
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
    const method = req.method || "GET";

    if (requestUrl.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (requestUrl.pathname === "/api/metals" && method === "GET") {
      const days = 30;
      const tasks = Object.entries(METALS_STOOQ_SYMBOL_MAP).map(async ([symbol, stooqSymbol]) => {
        try {
          const rows = await getStooqSeries(stooqSymbol, days + 2);
          const last = rows[rows.length - 1];
          const prev = rows.length >= 2 ? rows[rows.length - 2] : null;

          if (!last) {
            throw new Error(`No Stooq data for ${symbol}`);
          }

          const spotPrice = await getSpotPriceUsd(symbol, last.close);
          const change = prev ? spotPrice - prev.close : 0;
          const changePercent = prev && prev.close > 0 ? (change / prev.close) * 100 : 0;

          const dailyWindow = rows.slice(Math.max(rows.length - 3, 0));
          const dailyPrices = dailyWindow.map((r) => r.close).filter((p) => Number.isFinite(p) && p > 0);
          const high = dailyPrices.length ? Math.max(...dailyPrices) : spotPrice;
          const low = dailyPrices.length ? Math.min(...dailyPrices) : spotPrice;

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
            price: Math.round(spotPrice * 100) / 100,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            high24h: Math.round(high * 100) / 100,
            low24h: Math.round(low * 100) / 100,
            effectiveDate: last.date,
          };
        } catch (e) {
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
            price: 0,
            change: 0,
            changePercent: 0,
            high24h: 0,
            low24h: 0,
            effectiveDate: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      });

      const results = await Promise.all(tasks);
      return sendJson(res, 200, results);
    }

    if (requestUrl.pathname === "/api/etfs" && method === "GET") {
      try {
        const quotes = await fetchEtfQuotesFromTwelveData();
        return sendJson(res, 200, { etfs: quotes });
      } catch (e) {
        return sendJson(res, 503, { error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (requestUrl.pathname === "/api/news" && method === "GET") {
      try {
        const articles = await getNews();
        return sendJson(res, 200, { articles });
      } catch (e) {
        return sendJson(res, 503, { error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (requestUrl.pathname === "/api/ai/chat" && method === "POST") {
      const body = await readJsonBody(req);
      const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
      const messagesRaw = b?.messages;
      const apiKey = getGeminiApiKey(b?.apiKey);
      if (!apiKey) {
        return sendJson(res, 503, { error: "AI is not configured (missing GEMINI_API_KEY)" });
      }

      if (!Array.isArray(messagesRaw)) {
        return sendJson(res, 400, { error: "Invalid payload: messages must be an array" });
      }

      const messages: AiChatMessage[] = messagesRaw
        .map((m) => (m && typeof m === "object" ? (m as any) : null))
        .filter(Boolean)
        .map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: typeof m.content === "string" ? m.content : "",
        }))
        .filter((m) => m.content.trim().length > 0);

      if (messages.length === 0) {
        return sendJson(res, 400, { error: "Invalid payload: messages is empty" });
      }

      try {
        const reply = await callGeminiChat({ apiKey, messages });
        if (!reply) {
          return sendJson(res, 502, { error: "Empty response from AI" });
        }
        return sendJson(res, 200, { reply });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const lower = msg.toLowerCase();
        const status = lower.includes(" 401") || lower.includes(" 403") || lower.includes(" 400") ? 401 : lower.includes(" 429") ? 429 : 502;
        return sendJson(res, status, { error: msg });
      }
    }

    const metalsHistory = requestUrl.pathname.match(/^\/api\/metals\/(XAU|XAG|XPT|XPD)\/history$/i);
    if (metalsHistory && method === "GET") {
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

    if (requestUrl.pathname === "/api/alerts" && method === "POST") {
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

    if (requestUrl.pathname === "/api/alerts" && method === "GET") {
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
    if (del && method === "DELETE") {
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

    if (method === "GET" && !requestUrl.pathname.startsWith("/api/")) {
      if (fs.existsSync(DIST_DIR) && fs.existsSync(INDEX_HTML_PATH)) {
        const requestedPath = decodeURIComponent(requestUrl.pathname);
        const safePath = path
          .normalize(requestedPath)
          .replace(/^([\\/])+/g, "")
          .replace(/\0/g, "");

        if (safePath) {
          const abs = path.resolve(DIST_DIR, safePath);
          const isWithinDist = abs === DIST_DIR || abs.startsWith(DIST_DIR + path.sep);

          if (isWithinDist && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            const buf = fs.readFileSync(abs);
            res.writeHead(200, {
              "content-type": getContentType(abs),
              "cache-control": "public, max-age=31536000, immutable",
              "content-length": buf.length,
            });
            return res.end(buf);
          }
        }

        const html = fs.readFileSync(INDEX_HTML_PATH, "utf8");
        return sendText(res, 200, html, "text/html; charset=utf-8");
      }
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
