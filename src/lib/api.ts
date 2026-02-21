import type { MetalData, ChartDataPoint } from "./metals-data";

const METALPRICE_BASE_URL = "https://api.metalpriceapi.com/v1";
const GOLDAPI_BASE_URL = "https://www.goldapi.io/api";
const TWELVEDATA_BASE_URL = "https://api.twelvedata.com";

let twelveDataMetalsDisabledUntil = 0;
let goldApiDisabledUntil = 0;

const metalSymbols = [
  { id: "gold", name: "Gold", symbol: "XAU", color: "gold" },
  { id: "silver", name: "Silver", symbol: "XAG", color: "silver" },
  { id: "platinum", name: "Platinum", symbol: "XPT", color: "platinum" },
  { id: "palladium", name: "Palladium", symbol: "XPD", color: "palladium" },
];

const etfSymbols = [
  { symbol: "GLD", name: "SPDR Gold Shares" },
  { symbol: "SLV", name: "iShares Silver Trust" },
  { symbol: "PPLT", name: "abrdn Platinum ETF" },
  { symbol: "PALL", name: "abrdn Palladium ETF" },
  { symbol: "GDX", name: "VanEck Gold Miners" },
  { symbol: "GDXJ", name: "VanEck Junior Gold Miners" },
];

export interface EtfQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

function invertRateToUsdPerOunce(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return 1 / rate;
}

function toTwelveDataMetalSymbol(symbol: string): string {
  // Twelve Data uses forex-style symbols for metals
  // Example: XAU/USD
  return `${symbol}/USD`;
}

async function fetchDailyMetalSeriesFromTwelveData(
  apiKey: string,
  symbol: string,
  days: number,
): Promise<{ points: ChartDataPoint[]; lastClose: number; prevClose: number | null }> {
  const tdSymbol = toTwelveDataMetalSymbol(symbol);

  // Request a few extra points to be safe (weekends/holidays)
  const outputsize = Math.max(days + 5, 10);
  const url = `${TWELVEDATA_BASE_URL}/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=1day&outputsize=${outputsize}&apikey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Twelve Data time_series failed for ${tdSymbol}: ${res.status} ${res.statusText} - ${errorText}`);
  }

  const payload: unknown = await res.json();
  if (!payload || typeof payload !== "object") {
    throw new Error(`Twelve Data returned unexpected payload for ${tdSymbol}`);
  }

  const data = payload as Record<string, unknown>;
  if (data.status === "error" || data.code) {
    throw new Error(
      `Twelve Data error for ${tdSymbol}: ${String(data.message ?? data.info ?? "unknown error")}`,
    );
  }

  const values = data.values;
  if (!Array.isArray(values)) {
    throw new Error(`Twelve Data time_series missing values for ${tdSymbol}`);
  }

  // Twelve Data returns newest-first; we want oldest-first
  const parsed = values
    .map((v) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null))
    .filter((v): v is Record<string, unknown> => !!v)
    .map((v) => {
      const dt = typeof v.datetime === "string" ? v.datetime : null;
      const closeRaw = v.close;
      const close =
        typeof closeRaw === "string" ? parseFloat(closeRaw) : typeof closeRaw === "number" ? closeRaw : NaN;
      return { dt, close };
    })
    .filter((p) => !!p.dt && Number.isFinite(p.close) && p.close > 0);

  if (parsed.length === 0) {
    throw new Error(`Twelve Data time_series returned no usable points for ${tdSymbol}`);
  }

  const asc = [...parsed].reverse();
  const trimmed = asc.slice(Math.max(asc.length - (days + 1), 0));

  const points: ChartDataPoint[] = trimmed.map((p) => {
    const date = new Date(p.dt!);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: Math.round(p.close * 100) / 100,
    };
  });

  const lastClose = trimmed[trimmed.length - 1]?.close ?? 0;
  const prevClose = trimmed.length >= 2 ? trimmed[trimmed.length - 2]!.close : null;

  return {
    points,
    lastClose: Math.round(lastClose * 100) / 100,
    prevClose: prevClose != null ? Math.round(prevClose * 100) / 100 : null,
  };
}

async function fetchDailyMetalSeriesFromMetalpriceAPI(
  apiKey: string,
  symbol: string,
  days: number,
): Promise<{ points: ChartDataPoint[]; lastClose: number; prevClose: number | null }> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days + 7));

  const startDateStr = startDate.toISOString().slice(0, 10);
  const endDateStr = endDate.toISOString().slice(0, 10);

  const url = `${METALPRICE_BASE_URL}/timeframe?api_key=${encodeURIComponent(
    apiKey,
  )}&start_date=${startDateStr}&end_date=${endDateStr}&base=USD&currencies=${symbol}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `MetalpriceAPI timeframe failed for ${symbol}: ${res.status} ${res.statusText} - ${errorText}`,
    );
  }

  const json: {
    success?: boolean;
    rates?: Record<string, Record<string, number>>;
    error?: { code: number; info: string };
  } = await res.json();

  if (!json.success || !json.rates) {
    const msg = json.error?.info ?? "MetalpriceAPI returned an error.";
    throw new Error(`MetalpriceAPI timeframe error for ${symbol}: ${msg}`);
  }

  const pointsAll: Array<{ dt: string; close: number }> = Object.keys(json.rates)
    .sort()
    .map((dt) => {
      const rate = json.rates?.[dt]?.[symbol];
      const close = typeof rate === "number" ? invertRateToUsdPerOunce(rate) : 0;
      return { dt, close };
    })
    .filter((p) => Number.isFinite(p.close) && p.close > 0);

  if (pointsAll.length === 0) {
    throw new Error(`MetalpriceAPI timeframe returned no usable points for ${symbol}`);
  }

  const trimmed = pointsAll.slice(Math.max(pointsAll.length - (days + 1), 0));
  const points: ChartDataPoint[] = trimmed.map((p) => {
    const date = new Date(p.dt);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: Math.round(p.close * 100) / 100,
    };
  });

  const lastClose = trimmed[trimmed.length - 1]?.close ?? 0;
  const prevClose = trimmed.length >= 2 ? trimmed[trimmed.length - 2]!.close : null;

  return {
    points,
    lastClose: Math.round(lastClose * 100) / 100,
    prevClose: prevClose != null ? Math.round(prevClose * 100) / 100 : null,
  };
}

function validateMetalsData(data: MetalData[]): boolean {
  // Validate that we have data for all 4 metals and all prices are realistic
  if (!data || data.length !== 4) {
    return false;
  }
  
  // Check that all metals have valid prices (not 0, and within realistic ranges)
  const validRanges: Record<string, { min: number; max: number }> = {
    gold: { min: 1000, max: 10000 }, // XAU: $1000-$10000 per ounce
    silver: { min: 10, max: 200 }, // XAG: $10-$200 per ounce
    platinum: { min: 500, max: 5000 }, // XPT: $500-$5000 per ounce
    palladium: { min: 500, max: 5000 }, // XPD: $500-$5000 per ounce
  };

  return data.every((metal) => {
    const range = validRanges[metal.id];
    return (
      metal.price > 0 &&
      range &&
      metal.price >= range.min &&
      metal.price <= range.max
    );
  });
}

function sanitizeChangeValues(metal: MetalData): MetalData {
  // Validate change values - if they seem wrong, set to 0
  // Change percent should be reasonable (typically -10% to +10% per day for metals)
  const maxReasonableChangePercent = 15; // More than 15% change in a day is suspicious
  
  // If change percent is too large, it's probably wrong
  if (Math.abs(metal.changePercent) > maxReasonableChangePercent) {
    console.warn(
      `⚠️ Suspicious change for ${metal.symbol}: ${metal.changePercent.toFixed(2)}% - setting to 0`
    );
    return {
      ...metal,
      change: 0,
      changePercent: 0,
    };
  }
  
  // If change is 0 but price exists, that's okay (market might be flat)
  // But log it for debugging
  if (metal.change === 0 && metal.changePercent === 0 && metal.price > 0) {
    console.log(`ℹ️ ${metal.symbol}: No change detected (price: $${metal.price.toFixed(2)})`);
  }
  
  return metal;
}

async function fetchMetalsDataFromLocalScraper(): Promise<MetalData[]> {
  const res = await fetch("/api/metals");
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Local scraper error: ${res.status} ${res.statusText} - ${errorText}`);
  }

  const payload: unknown = await res.json();
  if (!Array.isArray(payload)) {
    throw new Error("Local scraper returned unexpected payload");
  }

  const colorById: Record<string, string> = {
    gold: "gold",
    silver: "silver",
    platinum: "platinum",
    palladium: "palladium",
  };

  const data = payload
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((v): v is Record<string, unknown> => !!v)
    .map((m) => {
      const id = typeof m.id === "string" ? m.id : "";
      const name = typeof m.name === "string" ? m.name : "";
      const symbol = typeof m.symbol === "string" ? m.symbol : "";
      const price = typeof m.price === "number" ? m.price : NaN;
      const change = typeof m.change === "number" ? m.change : 0;
      const changePercent = typeof m.changePercent === "number" ? m.changePercent : 0;
      const high24h = typeof m.high24h === "number" ? m.high24h : price;
      const low24h = typeof m.low24h === "number" ? m.low24h : price;

      return {
        id,
        name,
        symbol,
        price,
        change,
        changePercent,
        high24h,
        low24h,
        color: colorById[id] ?? "gold",
      } satisfies MetalData;
    });

  return data;
}

async function fetchHistoricalMetalDataFromLocalScraper(symbol: string, days: number): Promise<ChartDataPoint[]> {
  const res = await fetch(`/api/metals/${encodeURIComponent(symbol)}/history?days=${encodeURIComponent(String(days))}`);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Local scraper error: ${res.status} ${res.statusText} - ${errorText}`);
  }
  const payload: unknown = await res.json();
  if (!Array.isArray(payload)) {
    throw new Error("Local scraper returned unexpected payload");
  }
  return payload
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
    .filter((p): p is Record<string, unknown> => !!p)
    .map((p) => ({
      date: typeof p.date === "string" ? p.date : "",
      price: typeof p.price === "number" ? p.price : NaN,
    }))
    .filter((p) => !!p.date && Number.isFinite(p.price) && p.price > 0);
}

export async function fetchMetalsData(): Promise<MetalData[]> {
  // Option A: Use Twelve Data for metals (spot + historical) to keep cards and chart consistent.
  // Fallbacks: GoldAPI -> MetalpriceAPI
  const twelveDataApiKey = import.meta.env.VITE_TWELVEDATA_API_KEY;
  const goldApiKey = import.meta.env.VITE_GOLDAPI_API_KEY;
  const metalpriceApiKey = import.meta.env.VITE_METALPRICE_API_KEY;

  try {
    const local = await fetchMetalsDataFromLocalScraper();
    const sanitizedLocal = local.map(sanitizeChangeValues);
    if (validateMetalsData(sanitizedLocal)) {
      console.log("✅ Local scraper: Valid metals data received");
      return sanitizedLocal;
    }
  } catch (error) {
    console.warn("❌ Local scraper: Request failed, falling back to other providers:", error);
  }

  if (twelveDataApiKey && Date.now() >= twelveDataMetalsDisabledUntil) {
    try {
      const results = await Promise.all(
        metalSymbols.map(async (meta) => {
          const series = await fetchDailyMetalSeriesFromTwelveData(twelveDataApiKey, meta.symbol, 30);

          const price = series.lastClose;
          const change = series.prevClose != null ? price - series.prevClose : 0;
          const changePercent =
            series.prevClose != null && series.prevClose > 0 ? (change / series.prevClose) * 100 : 0;

          // High/Low from series points (approx 30-day range)
          const prices = series.points.map((p) => p.price).filter((p) => Number.isFinite(p) && p > 0);
          const high24h = prices.length ? Math.max(...prices) : price;
          const low24h = prices.length ? Math.min(...prices) : price;

          return {
            id: meta.id,
            name: meta.name,
            symbol: meta.symbol,
            price,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            high24h: Math.round(high24h * 100) / 100,
            low24h: Math.round(low24h * 100) / 100,
            color: meta.color,
          } satisfies MetalData;
        }),
      );

      const sanitized = results.map(sanitizeChangeValues);
      if (validateMetalsData(sanitized)) {
        console.log("✅ Twelve Data: Valid metals data received");
        return sanitized;
      }
      console.warn("❌ Twelve Data: Invalid metals data, falling back to other providers");
    } catch (error) {
      const msg = String(error instanceof Error ? error.message : error);
      if (msg.includes("available starting with") || msg.includes("pricing") || msg.includes("Grow")) {
        twelveDataMetalsDisabledUntil = Date.now() + 60 * 60 * 1000;
      }
      console.warn("❌ Twelve Data: Request failed, falling back to other providers:", error);
    }
  }

  // Prefer GoldAPI if available
  if (goldApiKey && Date.now() >= goldApiDisabledUntil) {
    try {
      const goldData = await fetchMetalsDataFromGoldAPI(goldApiKey);
      // Sanitize change values before validation
      const sanitizedGoldData = goldData.map(sanitizeChangeValues);
      // Validate that ALL metals have valid prices
      if (validateMetalsData(sanitizedGoldData)) {
        console.log("✅ GoldAPI: Valid data received");
        return sanitizedGoldData;
      }
      console.warn("❌ GoldAPI: Invalid data (prices out of range or missing), falling back to MetalpriceAPI");
    } catch (error) {
      const msg = String(error instanceof Error ? error.message : error);
      if (msg.includes("429") || msg.includes("403") || msg.toLowerCase().includes("quota")) {
        goldApiDisabledUntil = Date.now() + 30 * 60 * 1000;
      }
      console.warn("❌ GoldAPI: Request failed, falling back to MetalpriceAPI:", error);
      // Fall through to MetalpriceAPI
    }
  }

  if (!metalpriceApiKey) {
    throw new Error(
      "No API key configured. Please set VITE_TWELVEDATA_API_KEY, VITE_GOLDAPI_API_KEY, or VITE_METALPRICE_API_KEY.",
    );
  }

  try {
    const metalpriceData = await fetchMetalsDataFromMetalpriceAPI(metalpriceApiKey);
    // Sanitize change values before validation
    const sanitizedMetalpriceData = metalpriceData.map(sanitizeChangeValues);
    // Validate MetalpriceAPI data too
    if (validateMetalsData(sanitizedMetalpriceData)) {
      console.log("✅ MetalpriceAPI: Valid data received");
      return sanitizedMetalpriceData;
    }
    console.warn("❌ MetalpriceAPI: Invalid data (prices out of range or missing)");
    throw new Error("Both APIs returned invalid data. Please check your API keys and quotas.");
  } catch (error) {
    console.error("❌ MetalpriceAPI: Request failed:", error);
    throw error;
  }
}

async function fetchMetalsDataFromGoldAPI(apiKey: string): Promise<MetalData[]> {
  // GoldAPI provides real-time data with change included
  // Try "latest" first, fallback to today's date
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // Format: YYYYMMDD
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  const metalPromises = metalSymbols.map(async (meta) => {
    // Try latest endpoint first (if available), then today's date
    const urls = [
      `${GOLDAPI_BASE_URL}/${meta.symbol}/USD`, // Latest (no date)
      `${GOLDAPI_BASE_URL}/${meta.symbol}/USD/${today}`, // Today's date
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            "x-access-token": apiKey,
          },
        });

        if (!res.ok) {
          const errorText = await res.text();
          // If it's a 404 or invalid date, try next URL
          if (res.status === 404 && url.includes(today)) {
            continue;
          }
          throw new Error(`GoldAPI error for ${meta.symbol}: ${res.status} - ${errorText}`);
        }

        const data: {
          price?: number;
          ask?: number;
          bid?: number;
          ch?: number; // change amount
          chp?: number; // change percent
          timestamp?: number;
          error?: string;
        } = await res.json();

        // Check for API errors in response
        if (data.error) {
          throw new Error(`GoldAPI error: ${data.error}`);
        }

        const price = data.price ?? data.ask ?? data.bid ?? 0;
        
        // If price is 0, this endpoint didn't work, try next
        if (price === 0 && url.includes(today)) {
          continue;
        }

        // GoldAPI provides change values - use them directly when present.
        // Some plans/endpoints omit ch/chp, so compute change from yesterday as a fallback.
        let change = typeof data.ch === "number" ? data.ch : 0;
        let changePercent = typeof data.chp === "number" ? data.chp : 0;

        if ((data.ch == null || data.chp == null) && price > 0) {
          try {
            const yesterdayUrl = `${GOLDAPI_BASE_URL}/${meta.symbol}/USD/${yesterday}`;
            const yesterdayRes = await fetch(yesterdayUrl, {
              headers: {
                "x-access-token": apiKey,
              },
            });

            if (yesterdayRes.ok) {
              const y: {
                price?: number;
                ask?: number;
                bid?: number;
                error?: string;
              } = await yesterdayRes.json();

              if (!y.error) {
                const yesterdayPrice = y.price ?? y.ask ?? y.bid ?? 0;
                if (typeof yesterdayPrice === "number" && yesterdayPrice > 0) {
                  change = price - yesterdayPrice;
                  changePercent = (change / yesterdayPrice) * 100;
                }
              }
            }
          } catch {
            // If fallback fails, keep change at 0
          }
        }

        // If change values are 0 but we have a price, log it for debugging
        if (change === 0 && changePercent === 0 && price > 0) {
          console.log(`⚠️ GoldAPI: ${meta.symbol} has price ${price} but no change data (ch: ${data.ch}, chp: ${data.chp})`);
        }

        return {
          id: meta.id,
          name: meta.name,
          symbol: meta.symbol,
          price: Math.round(price * 100) / 100,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          high24h: price, // GoldAPI doesn't provide 24h high/low in free tier
          low24h: price,
          color: meta.color,
        };
      } catch (error) {
        // If this was the last URL, throw the error
        if (url === urls[urls.length - 1]) {
          console.error(`Failed to fetch ${meta.symbol} from GoldAPI:`, error);
          throw error;
        }
        // Otherwise, continue to next URL
        continue;
      }
    }

    // If we get here, all URLs failed
    throw new Error(`Failed to fetch ${meta.symbol} from GoldAPI: all endpoints failed`);
  });

  return Promise.all(metalPromises);
}

async function fetchMetalsDataFromMetalpriceAPI(apiKey: string): Promise<MetalData[]> {
  const results = await Promise.all(
    metalSymbols.map(async (meta) => {
      const series = await fetchDailyMetalSeriesFromMetalpriceAPI(apiKey, meta.symbol, 30);

      const price = series.lastClose;
      const change = series.prevClose != null ? price - series.prevClose : 0;
      const changePercent =
        series.prevClose != null && series.prevClose > 0 ? (change / series.prevClose) * 100 : 0;

      const prices = series.points.map((p) => p.price).filter((p) => Number.isFinite(p) && p > 0);
      const high24h = prices.length ? Math.max(...prices) : price;
      const low24h = prices.length ? Math.min(...prices) : price;

      return {
        id: meta.id,
        name: meta.name,
        symbol: meta.symbol,
        price,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        high24h: Math.round(high24h * 100) / 100,
        low24h: Math.round(low24h * 100) / 100,
        color: meta.color,
      } satisfies MetalData;
    }),
  );

  return results;
}

export async function fetchHistoricalMetalData(
  symbol: string,
  days: number = 30,
): Promise<ChartDataPoint[]> {
  const twelveDataApiKey = import.meta.env.VITE_TWELVEDATA_API_KEY;
  const metalpriceApiKey = import.meta.env.VITE_METALPRICE_API_KEY;
  const goldApiKey = import.meta.env.VITE_GOLDAPI_API_KEY;

  if (!twelveDataApiKey && !metalpriceApiKey && !goldApiKey) {
    throw new Error("No API key configured for historical data");
  }

  try {
    const points = await fetchHistoricalMetalDataFromLocalScraper(symbol, days);
    if (points.length > 0) {
      console.log(`✅ Local scraper: Fetched ${points.length} historical data points for ${symbol}`);
      return points;
    }
  } catch (error) {
    console.warn(`Failed to fetch historical data from local scraper for ${symbol}:`, error);
  }

  if (twelveDataApiKey) {
    try {
      const series = await fetchDailyMetalSeriesFromTwelveData(twelveDataApiKey, symbol, days);
      if (series.points.length > 0) {
        console.log(`✅ Twelve Data: Fetched ${series.points.length} historical data points for ${symbol}`);
        return series.points;
      }
    } catch (error) {
      console.warn(`Failed to fetch historical data from Twelve Data for ${symbol}:`, error);
    }
  }

  // Try MetalpriceAPI timeframe endpoint (free tier supports up to 365 days)
  if (metalpriceApiKey) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const startDateStr = startDate.toISOString().slice(0, 10);
      const endDateStr = endDate.toISOString().slice(0, 10);

      const url = `${METALPRICE_BASE_URL}/timeframe?api_key=${encodeURIComponent(
        metalpriceApiKey,
      )}&start_date=${startDateStr}&end_date=${endDateStr}&base=USD&currencies=${symbol}`;

      const res = await fetch(url);
      if (res.ok) {
        const json: {
          success?: boolean;
          rates?: Record<string, Record<string, number>>;
        } = await res.json();

        if (json.success && json.rates) {
          const dataPoints: ChartDataPoint[] = [];

          // Sort dates and extract prices
          Object.keys(json.rates)
            .sort()
            .forEach((dateStr) => {
              const dayRates = json.rates![dateStr];
              const rate = dayRates[symbol];
              const price = typeof rate === "number" ? invertRateToUsdPerOunce(rate) : 0;
              if (price > 0) {
                const date = new Date(dateStr);
                dataPoints.push({
                  date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                  price: Math.round(price * 100) / 100,
                });
              }
            });

          if (dataPoints.length > 0) {
            console.log(`✅ Fetched ${dataPoints.length} historical data points for ${symbol}`);
            return dataPoints;
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch historical data from MetalpriceAPI for ${symbol}:`, error);
    }
  }

  // Fallback: Return empty array (component will handle gracefully)
  console.warn(`⚠️ No historical data available for ${symbol}`);
  return [];
}

export async function fetchEtfQuotes(): Promise<EtfQuote[]> {
  const apiKey = import.meta.env.VITE_TWELVEDATA_API_KEY;

  if (!apiKey) {
    throw new Error("Twelve Data API key is not configured (VITE_TWELVEDATA_API_KEY).");
  }

  // Twelve Data quote endpoint requires individual requests per symbol
  // We'll fetch them in parallel for better performance
  const quotePromises = etfSymbols.map(async (etf) => {
    const url = `${TWELVEDATA_BASE_URL}/quote?symbol=${encodeURIComponent(
      etf.symbol,
    )}&apikey=${encodeURIComponent(apiKey)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`Failed to fetch ${etf.symbol}: ${res.statusText} - ${errorText}`);
        return null;
      }

      const payload: unknown = await res.json();

      if (!payload || typeof payload !== "object") {
        console.warn(`Unexpected response for ${etf.symbol}:`, payload);
        return null;
      }

      const data = payload as Record<string, unknown>;

      // Handle error responses from Twelve Data
      if (data.status === "error" || data.code) {
        console.warn(`Error for ${etf.symbol}:`, data.message || data.info);
        return null;
      }

      // Extract price (try multiple possible fields)
      const price =
        typeof data.close === "string"
          ? parseFloat(data.close)
          : typeof data.close === "number"
            ? data.close
            : typeof data.price === "string"
              ? parseFloat(data.price)
              : typeof data.price === "number"
                ? data.price
                : typeof data.last === "string"
                  ? parseFloat(data.last)
                  : typeof data.last === "number"
                    ? data.last
                    : 0;

      // Extract change
      const change =
        typeof data.change === "string"
          ? parseFloat(data.change)
          : typeof data.change === "number"
            ? data.change
            : 0;

      // Extract percent change
      const changePercent =
        typeof data.percent_change === "string"
          ? parseFloat(data.percent_change)
          : typeof data.percent_change === "number"
            ? data.percent_change
            : typeof data.change_percent === "string"
              ? parseFloat(data.change_percent)
              : typeof data.change_percent === "number"
                ? data.change_percent
                : 0;

      return {
        symbol: etf.symbol,
        name: (typeof data.name === "string" ? data.name : undefined) ?? etf.name ?? etf.symbol,
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
      };
    } catch (error) {
      console.warn(`Error fetching ${etf.symbol}:`, error);
      return null;
    }
  });

  const results = await Promise.all(quotePromises);
  const quotes = results.filter((q): q is EtfQuote => q !== null);

  return quotes;
}

