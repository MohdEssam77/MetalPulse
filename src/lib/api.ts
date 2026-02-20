import type { MetalData, ChartDataPoint } from "./metals-data";

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

export async function fetchMetalsData(): Promise<MetalData[]> {
  // Try GoldAPI first (more real-time), fallback to MetalpriceAPI
  const goldApiKey = import.meta.env.VITE_GOLDAPI_API_KEY;
  const metalpriceApiKey = import.meta.env.VITE_METALPRICE_API_KEY;

  // Prefer GoldAPI if available
  if (goldApiKey) {
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
      console.warn("❌ GoldAPI: Request failed, falling back to MetalpriceAPI:", error);
      // Fall through to MetalpriceAPI
    }
  }

  if (!metalpriceApiKey) {
    throw new Error(
      "No API key configured. Please set VITE_GOLDAPI_API_KEY or VITE_METALPRICE_API_KEY.",
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

        // GoldAPI provides change values - use them directly
        // ch = change amount, chp = change percent
        const change = data.ch ?? 0;
        const changePercent = data.chp ?? 0;

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

  const metalData = await Promise.all(metalSymbols.map(async (meta) => {
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
        
        // Only log if change is significant (helps debug)
        if (Math.abs(changePct) > 0.01) {
          console.log(
            `📊 MetalpriceAPI ${meta.symbol}: Today=$${price.toFixed(2)}, Yesterday=$${yesterdayPrice.toFixed(2)}, Change=$${change.toFixed(2)} (${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%)`
          );
        } else {
          console.log(
            `📊 MetalpriceAPI ${meta.symbol}: Price=$${price.toFixed(2)}, Change=~0% (market flat or data not updated)`
          );
        }
      } else {
        console.warn(`⚠️ MetalpriceAPI ${meta.symbol}: Cannot calculate change - yesterday price invalid (${yesterdayPrice})`);
      }
    } else {
      // Try to get change from 2 days ago as fallback
      try {
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const twoDaysAgoStr = twoDaysAgo.toISOString().slice(0, 10);
        
        const twoDaysAgoUrl = `${METALPRICE_BASE_URL}/${twoDaysAgoStr}?api_key=${encodeURIComponent(
          apiKey,
        )}&base=USD&currencies=${encodeURIComponent(currencies)}`;
        
        const twoDaysAgoRes = await fetch(twoDaysAgoUrl);
        if (twoDaysAgoRes.ok) {
          const twoDaysAgoJson: {
            success?: boolean;
            rates?: Record<string, number>;
          } = await twoDaysAgoRes.json();
          
          if (twoDaysAgoJson.success && twoDaysAgoJson.rates) {
            const twoDaysAgoPrice = twoDaysAgoJson.rates[usdSymbol];
            if (typeof twoDaysAgoPrice === "number" && twoDaysAgoPrice > 0 && price > 0) {
              change = price - twoDaysAgoPrice;
              changePct = (change / twoDaysAgoPrice) * 100;
              console.log(
                `📊 MetalpriceAPI ${meta.symbol}: Using 2-day comparison - Today=$${price.toFixed(2)}, 2 days ago=$${twoDaysAgoPrice.toFixed(2)}, Change=$${change.toFixed(2)} (${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%)`
              );
            }
          }
        }
      } catch (error) {
        // Silently fail - we'll just show 0 change
      }
      
      if (change === 0) {
        console.warn(`⚠️ MetalpriceAPI ${meta.symbol}: No historical data available for change calculation - showing 0%`);
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
  }));

  return metalData;
}

export async function fetchHistoricalMetalData(
  symbol: string,
  days: number = 30,
): Promise<ChartDataPoint[]> {
  const metalpriceApiKey = import.meta.env.VITE_METALPRICE_API_KEY;
  const goldApiKey = import.meta.env.VITE_GOLDAPI_API_KEY;

  if (!metalpriceApiKey && !goldApiKey) {
    throw new Error("No API key configured for historical data");
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
          rates?: Record<string, Record<string, Record<string, number>>>;
        } = await res.json();

        if (json.success && json.rates) {
          const dataPoints: ChartDataPoint[] = [];
          const usdSymbol = `USD${symbol}`;

          // Sort dates and extract prices
          Object.keys(json.rates)
            .sort()
            .forEach((dateStr) => {
              const dayRates = json.rates![dateStr];
              const price = dayRates[usdSymbol];
              if (typeof price === "number" && price > 0) {
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

