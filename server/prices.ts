const METALS_SYMBOL_MAP: Record<string, string> = {
  XAU: "xauusd",
  XAG: "xagusd",
  XPT: "xptusd",
  XPD: "xpdusd",
};

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
      const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d&l=${days}`;
      const res = await fetch(url, {
        headers: {
          "user-agent": "MetalPulse/1.0",
        },
      });
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
    }),
  );

  return Object.fromEntries(entries);
}
