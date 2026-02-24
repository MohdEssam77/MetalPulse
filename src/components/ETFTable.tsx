import { TrendingUp, TrendingDown } from "lucide-react";
import { ETFS_DATA } from "@/lib/metals-data";
import { useEtfs } from "@/hooks/use-etfs";
import { useCurrency } from "@/components/currency-provider";
import { useUsdToEurRate } from "@/hooks/use-currency-rate";
import { convertUsdToCurrency, formatMoney } from "@/lib/currency";

const ETFTable = () => {
  const { data, isLoading, isError } = useEtfs();
  const etfs = data && data.length > 0 ? data : ETFS_DATA;
  const { currency } = useCurrency();
  const { data: fx } = useUsdToEurRate();
  const rate = fx?.rate ?? null;

  return (
    <div className="rounded-xl border border-border bg-gradient-card p-6">
      <h3 className="mb-4 font-display text-lg font-semibold text-foreground">
        Popular Metal ETFs
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 pr-4">Symbol</th>
              <th className="pb-3 pr-4">Name</th>
              <th className="pb-3 pr-4 text-right">Price</th>
              <th className="pb-3 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {etfs.map((etf) => {
              const isPositive = etf.change >= 0;
              const displayPrice = convertUsdToCurrency(etf.price, currency, rate);
              return (
                <tr
                  key={etf.symbol}
                  className="border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/30"
                >
                  <td className="py-3 pr-4 font-display font-semibold text-primary">
                    {etf.symbol}
                  </td>
                  <td className="py-3 pr-4 text-sm text-foreground">{etf.name}</td>
                  <td className="py-3 pr-4 text-right font-medium text-foreground">
                    {formatMoney(displayPrice, currency)}
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={`inline-flex items-center gap-1 text-sm font-medium ${
                        isPositive ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {isPositive ? "+" : ""}
                      {etf.changePercent.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isLoading && (
        <p className="mt-2 text-xs text-muted-foreground">Loading live ETF data…</p>
      )}
      {isError && (
        <p className="mt-2 text-xs text-red-400">
          Couldn&apos;t load live ETF data. Showing sample prices instead.
        </p>
      )}
    </div>
  );
};

export default ETFTable;
