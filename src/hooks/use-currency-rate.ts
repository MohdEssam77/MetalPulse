import { useQuery } from "@tanstack/react-query";

async function fetchUsdToEurRate(): Promise<{ rate: number; date?: string }> {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=EUR");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`FX rate fetch failed: ${res.status} ${res.statusText} ${t}`);
  }

  const payload: unknown = await res.json();
  if (!payload || typeof payload !== "object") throw new Error("FX rate payload invalid");

  const p = payload as { rates?: Record<string, unknown>; date?: unknown };
  const eur = p.rates?.EUR;
  const rate = typeof eur === "number" ? eur : NaN;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX rate missing/invalid");

  return { rate, date: typeof p.date === "string" ? p.date : undefined };
}

export function useUsdToEurRate() {
  return useQuery({
    queryKey: ["fx", "USD", "EUR"],
    queryFn: fetchUsdToEurRate,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
