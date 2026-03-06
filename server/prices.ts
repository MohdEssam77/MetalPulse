const METALS_SYMBOL_MAP: Record<string, string> = {
  XAU: "xauusd",
  XAG: "xagusd",
  XPT: "xptusd",
  XPD: "xpdusd",
};

async function fetchWithTimeout(url: string, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchTwelveDataMetalPricesUsd(apiKey: string): Promise<Record<string, number>> {
  const symbols = Object.keys(METALS_SYMBOL_MAP);
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
    symbols.join(","),
  )}&apikey=${encodeURIComponent(apiKey)}`;

  const res = await fetchWithTimeout(url, 15000);

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Twelve Data fetch failed: ${res.status} ${res.statusText} - ${t}`);
  }

  const json: any = await res.json();

  if (json?.status === "error") {
    const msg = json?.message ? String(json.message) : "Unknown Twelve Data error";
    throw new Error(`Twelve Data error: ${msg}`);
  }

  const out: Record<string, number> = {};

  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const [symbol, payload] of Object.entries(json)) {
      if (!payload || typeof payload !== "object") continue;
      const priceRaw = (payload as any).price;
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

export async function fetchLatestMetalPricesUsd(): Promise<Record<string, number>> {
  const days = 2;

  const entries = await Promise.all(
    Object.entries(METALS_SYMBOL_MAP).map(async ([symbol, stooqSymbol]) => {
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d&l=${days}`;
          const res = await fetchWithTimeout(url, 10000);
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error(`Stooq fetch failed for ${symbol}: ${res.status} ${res.statusText} - ${t}`);
          }
          const text = await res.text();
          const rows = parseStooqCsv(text);
          if (rows.length === 0) {
            throw new Error(`Stooq returned no rows for ${symbol}`);
          }
          const last = rows[rows.length - 1]!;
          return [symbol, Math.round(last.close * 100) / 100] as const;
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          if (attempt < 2) {
            console.warn(`Stooq fetch attempt ${attempt} failed for ${symbol}, retrying...`);
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
      throw lastError || new Error(`Stooq fetch failed for ${symbol} after retries`);
    }),
  );

  const prices = Object.fromEntries(entries);

  const twelveDataApiKey =
    process.env.TWELVEDATA_API_KEY || process.env.VITE_TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY;
  if (twelveDataApiKey && Object.keys(prices).length < Object.keys(METALS_SYMBOL_MAP).length) {
    try {
      const twelvePrices = await fetchTwelveDataMetalPricesUsd(twelveDataApiKey);
      for (const [symbol, price] of Object.entries(twelvePrices)) {
        if (!prices[symbol]) {
          prices[symbol] = price;
        }
      }
      console.warn(`Stooq fetch incomplete, filled missing symbols with TwelveData`);
    } catch (e) {
      console.warn(`TwelveData fallback failed:`, e instanceof Error ? e.message : String(e));
    }
  }

  return prices;
}
