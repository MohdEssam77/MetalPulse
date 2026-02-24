import { TrendingUp, TrendingDown } from "lucide-react";
import type { MetalData } from "@/lib/metals-data";
import { useCurrency } from "@/components/currency-provider";
import { useUsdToEurRate } from "@/hooks/use-currency-rate";
import { convertUsdToCurrency, formatMoney } from "@/lib/currency";

interface MetalCardProps {
  metal: MetalData;
  onClick?: () => void;
  isSelected?: boolean;
}

function weekdayFromEffectiveDate(effectiveDate?: string) {
  if (!effectiveDate) return "today";

  // `effectiveDate` coming from the scraper is a market date (typically `YYYY-MM-DD`).
  // Parse it as a UTC date to avoid local-time midnight shifting the weekday.
  const m = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ? effectiveDate : null;
  const dt = m ? new Date(`${effectiveDate}T00:00:00Z`) : new Date(effectiveDate);
  if (!Number.isFinite(dt.getTime())) return "today";
  return dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

const colorMap: Record<string, string> = {
  gold: "text-gold border-gold/30 shadow-[0_0_20px_hsl(43_96%_56%/0.1)]",
  silver: "text-silver border-silver/30 shadow-[0_0_20px_hsl(220_10%_70%/0.1)]",
  platinum: "text-platinum border-platinum/30 shadow-[0_0_20px_hsl(200_15%_60%/0.1)]",
  palladium: "text-palladium border-palladium/30 shadow-[0_0_20px_hsl(25_60%_50%/0.1)]",
};

const MetalCard = ({ metal, onClick, isSelected }: MetalCardProps) => {
  const { currency } = useCurrency();
  const { data: fx } = useUsdToEurRate();

  const rate = fx?.rate ?? null;

  const isPositive = Number.isFinite(metal.changePercent)
    ? metal.changePercent >= 0
    : metal.change >= 0;
  const colorClass = colorMap[metal.color] || "";

  const changeLabel = weekdayFromEffectiveDate(metal.effectiveDate);

  const displayPrice = convertUsdToCurrency(metal.price, currency, rate);
  const displayChange = convertUsdToCurrency(metal.change, currency, rate);
  const displayLow = convertUsdToCurrency(metal.low24h, currency, rate);
  const displayHigh = convertUsdToCurrency(metal.high24h, currency, rate);

  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-xl border bg-gradient-card p-5 text-left transition-all duration-300 hover:scale-[1.02] ${
        isSelected ? `${colorClass} ring-1 ring-primary/30` : "border-border hover:border-muted-foreground/30"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {metal.symbol}
          </p>
          <h3 className="font-display text-lg font-semibold text-foreground">{metal.name}</h3>
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            isPositive
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {isPositive ? "+" : ""}
          {metal.changePercent.toFixed(2)}%
        </div>
      </div>

      <p className="font-display text-2xl font-bold text-foreground">
        {formatMoney(displayPrice, currency)}
      </p>
      <p className={`mt-1 text-sm ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
        {isPositive ? "+" : ""}{formatMoney(displayChange, currency)} {changeLabel}
      </p>

      <div className="mt-3 flex justify-between text-xs text-muted-foreground">
        <span>L: {formatMoney(displayLow, currency)}</span>
        <span>H: {formatMoney(displayHigh, currency)}</span>
      </div>
    </button>
  );
};

export default MetalCard;
