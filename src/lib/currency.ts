export type Currency = "USD" | "EUR";

export const DEFAULT_CURRENCY: Currency = "USD";

export function convertUsdToCurrency(valueUsd: number, currency: Currency, usdToEurRate: number | null): number {
  if (!Number.isFinite(valueUsd)) return 0;
  if (currency === "USD") return valueUsd;
  if (currency === "EUR") {
    return usdToEurRate && Number.isFinite(usdToEurRate) ? valueUsd * usdToEurRate : valueUsd;
  }
  return valueUsd;
}

export function formatMoney(value: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
