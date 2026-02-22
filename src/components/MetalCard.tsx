import { TrendingUp, TrendingDown } from "lucide-react";
import type { MetalData } from "@/lib/metals-data";

interface MetalCardProps {
  metal: MetalData;
  onClick?: () => void;
  isSelected?: boolean;
}

const colorMap: Record<string, string> = {
  gold: "text-gold border-gold/30 shadow-[0_0_20px_hsl(43_96%_56%/0.1)]",
  silver: "text-silver border-silver/30 shadow-[0_0_20px_hsl(220_10%_70%/0.1)]",
  platinum: "text-platinum border-platinum/30 shadow-[0_0_20px_hsl(200_15%_60%/0.1)]",
  palladium: "text-palladium border-palladium/30 shadow-[0_0_20px_hsl(25_60%_50%/0.1)]",
};

const MetalCard = ({ metal, onClick, isSelected }: MetalCardProps) => {
  const isPositive = metal.change >= 0;
  const colorClass = colorMap[metal.color] || "";

  const changeLabel = (() => {
    if (!metal.effectiveDate) return "today";
    const dt = new Date(metal.effectiveDate);
    if (!Number.isFinite(dt.getTime())) return "today";
    return dt.toLocaleDateString("en-US", { weekday: "short" });
  })();

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
        ${metal.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </p>
      <p className={`mt-1 text-sm ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
        {isPositive ? "+" : ""}${metal.change.toFixed(2)} {changeLabel}
      </p>

      <div className="mt-3 flex justify-between text-xs text-muted-foreground">
        <span>L: ${metal.low24h.toLocaleString()}</span>
        <span>H: ${metal.high24h.toLocaleString()}</span>
      </div>
    </button>
  );
};

export default MetalCard;
