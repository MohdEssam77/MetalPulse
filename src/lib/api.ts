import type { MetalData } from "./metals-data";

const METALPRICE_BASE_URL = "https://api.metalpriceapi.com/v1";
const GOLDAPI_BASE_URL = "https://www.goldapi.io/api";
const TWELVEDATA_BASE_URL = "https://api.twelvedata.com";

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

export async function fetchMetalsData(): Promise<MetalData[]> {
  // Try GoldAPI first (more real-time), fallback to MetalpriceAPI
  const goldApiKey = import.meta.env.VITE_GOLDAPI_API_KEY;
  const metalpriceApiKey = import.meta.env.VITE_METALPRICE_API_KEY;

  // Prefer GoldAPI if available
  if (goldApiKey) {
    try {
      const goldData = await fetchMetalsDataFromGoldAPI(goldApiKey);
      // Only return if we got valid data (at least one metal with price > 0)
      if (goldData.some((m) => m.price > 0)) {
        return goldData;
      }
      console.warn("GoldAPI returned invalid data, falling back to MetalpriceAPI");
    } catch (error) {
      console.warn("GoldAPI failed, falling back to MetalpriceAPI:", error);
      // Fall through to MetalpriceAPI
    }
  }

  if (!metalpriceApiKey) {
    throw new Error(
      "No API key configured. Please set VITE_GOLDAPI_API_KEY or VITE_METALPRICE_API_KEY.",
    );
  }

  return await fetchMetalsDataFromMetalpriceAPI(metalpriceApiKey);
}

async function fetchMetalsDataFromGoldAPI(apiKey: string): Promise<MetalData[]> {
  // GoldAPI provides real-time data with change included
  // Try "latest" first, fallback to today's date
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // Format: YYYYMMDD

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

        const change = data.ch ?? 0;
        const changePercent = data.chp ?? 0;

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
  const currencies = metalSymbols.map((m) => m.symbol).join(",");

  // Fetch latest prices (FREE TIER - Daily updates)
  const latestUrl = `${METALPRICE_BASE_URL}/latest?api_key=${encodeURIComponent(
    apiKey,
  )}&base=USD&currencies=${encodeURIComponent(currencies)}`;

  const latestRes = await fetch(latestUrl);
  if (!latestRes.ok) {
    const errorText = await latestRes.text();
    let errorMessage = `Failed to fetch latest metal prices: ${latestRes.statusText}`;
    
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.info) {
        errorMessage += ` - ${errorJson.error.info}`;
      } else {
        errorMessage += ` - ${errorText}`;
      }
    } catch {
      errorMessage += ` - ${errorText}`;
    }
    
    throw new Error(errorMessage);
  }

  const latestJson: {
    success?: boolean;
    rates?: Record<string, number>;
    error?: { code: number; info: string };
  } = await latestRes.json();

  if (!latestJson.success) {
    const errorMsg =
      latestJson.error?.info ?? "MetalpriceAPI returned an error. Check your API key and quota.";
    throw new Error(errorMsg);
  }

  if (!latestJson.rates) {
    throw new Error("Unexpected response from MetalpriceAPI: missing rates.");
  }

  // Fetch yesterday's prices for change calculation (FREE TIER)
  // Using "yesterday" endpoint which is simpler and free-tier compatible
  const yesterdayUrl = `${METALPRICE_BASE_URL}/yesterday?api_key=${encodeURIComponent(
    apiKey,
  )}&base=USD&currencies=${encodeURIComponent(currencies)}`;

  let yesterdayRates: Record<string, number> = {};
  
  try {
    const yesterdayRes = await fetch(yesterdayUrl);
    if (yesterdayRes.ok) {
      const yesterdayJson: {
        success?: boolean;
        rates?: Record<string, number>;
        error?: { code: number; info: string };
      } = await yesterdayRes.json();

      if (yesterdayJson.success && yesterdayJson.rates) {
        yesterdayRates = yesterdayJson.rates;
      } else if (yesterdayJson.error) {
        console.warn("Could not fetch yesterday's prices:", yesterdayJson.error.info);
      }
    }
  } catch (error) {
    console.warn("Failed to fetch yesterday's prices for change calculation:", error);
  }

  return metalSymbols.map((meta) => {
    // Use USDXAU format (USD per ounce) instead of XAU (ounces per USD)
    const usdSymbol = `USD${meta.symbol}`;
    const latestPrice = latestJson.rates?.[usdSymbol];
    const price = typeof latestPrice === "number" && latestPrice > 0 ? latestPrice : 0;

    // Calculate change from yesterday's price (FREE TIER method)
    let change = 0;
    let changePct = 0;

    if (Object.keys(yesterdayRates).length > 0) {
      const yesterdayPrice = yesterdayRates[usdSymbol];
      if (typeof yesterdayPrice === "number" && yesterdayPrice > 0 && price > 0) {
        change = price - yesterdayPrice;
        changePct = (change / yesterdayPrice) * 100;
      }
    }

    // For free tier, high/low are not available, use current price
    const high24h = price;
    const low24h = price;

    return {
      id: meta.id,
      name: meta.name,
      symbol: meta.symbol,
      price: Math.round(price * 100) / 100, // Round to 2 decimal places
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePct * 100) / 100,
      high24h: Math.round(high24h * 100) / 100,
      low24h: Math.round(low24h * 100) / 100,
      color: meta.color,
    };
  });
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

      const payload = (await res.json()) as any;

      // Handle error responses from Twelve Data
      if (payload.status === "error" || payload.code) {
        console.warn(`Error for ${etf.symbol}:`, payload.message || payload.info);
        return null;
      }

      // Extract price (try multiple possible fields)
      const price =
        typeof payload.close === "string"
          ? parseFloat(payload.close)
          : typeof payload.close === "number"
            ? payload.close
            : typeof payload.price === "string"
              ? parseFloat(payload.price)
              : typeof payload.price === "number"
                ? payload.price
                : typeof payload.last === "string"
                  ? parseFloat(payload.last)
                  : typeof payload.last === "number"
                    ? payload.last
                    : 0;

      // Extract change
      const change =
        typeof payload.change === "string"
          ? parseFloat(payload.change)
          : typeof payload.change === "number"
            ? payload.change
            : 0;

      // Extract percent change
      const changePercent =
        typeof payload.percent_change === "string"
          ? parseFloat(payload.percent_change)
          : typeof payload.percent_change === "number"
            ? payload.percent_change
            : typeof payload.change_percent === "string"
              ? parseFloat(payload.change_percent)
              : typeof payload.change_percent === "number"
                ? payload.change_percent
                : 0;

      return {
        symbol: etf.symbol,
        name: payload.name ?? etf.name ?? etf.symbol,
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

