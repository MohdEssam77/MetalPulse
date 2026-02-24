import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Currency } from "@/lib/currency";
import { DEFAULT_CURRENCY } from "@/lib/currency";

type CurrencyContextValue = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  toggleCurrency: () => void;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);

  const value = useMemo<CurrencyContextValue>(() => {
    return {
      currency,
      setCurrency,
      toggleCurrency: () => setCurrency((c) => (c === "USD" ? "EUR" : "USD")),
    };
  }, [currency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
