import { TrendingUp, TrendingDown } from "lucide-react";
import { ETFS_DATA } from "@/lib/metals-data";

const ETFTable = () => {
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
            {ETFS_DATA.map((etf) => {
              const isPositive = etf.change >= 0;
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
                    ${etf.price.toFixed(2)}
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
    </div>
  );
};

export default ETFTable;
