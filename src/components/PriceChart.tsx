import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { fetchHistoricalMetalData } from "@/lib/api";
import { generateChartData } from "@/lib/metals-data";
import type { MetalData } from "@/lib/metals-data";

interface PriceChartProps {
  metal: MetalData;
}

const chartColors: Record<string, { stroke: string; fill: string }> = {
  gold: { stroke: "hsl(43, 96%, 56%)", fill: "hsl(43, 96%, 56%)" },
  silver: { stroke: "hsl(220, 10%, 70%)", fill: "hsl(220, 10%, 70%)" },
  platinum: { stroke: "hsl(200, 15%, 60%)", fill: "hsl(200, 15%, 60%)" },
  palladium: { stroke: "hsl(25, 60%, 50%)", fill: "hsl(25, 60%, 50%)" },
};

const PriceChart = ({ metal }: PriceChartProps) => {
  // Fetch real historical data
  const { data: historicalData, isLoading } = useQuery({
    queryKey: ["historical", metal.symbol],
    queryFn: () => fetchHistoricalMetalData(metal.symbol, 30),
    staleTime: 300_000, // 5 minutes - historical data doesn't change often
    refetchInterval: false, // Don't auto-refetch historical data
  });

  // Use real data if available, otherwise fallback to generated data
  const data = useMemo(() => {
    if (historicalData && historicalData.length > 0) {
      return historicalData;
    }
    // Fallback to generated data if API fails
    return generateChartData(metal.price, 30);
  }, [historicalData, metal.price]);

  const colors = chartColors[metal.color] || chartColors.gold;

  return (
    <div className="rounded-xl border border-border bg-gradient-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-foreground">
          {metal.name} ({metal.symbol}) — 30 Day
        </h3>
        <span className="text-sm text-muted-foreground">USD</span>
      </div>
      <div className="h-[300px] w-full">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading historical data...
          </div>
        )}
        {!isLoading && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id={`gradient-${metal.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.fill} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors.fill} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 12 }}
              axisLine={{ stroke: "hsl(220, 14%, 18%)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
              tickFormatter={(v) => `$${v.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(220, 18%, 10%)",
                border: "1px solid hsl(220, 14%, 18%)",
                borderRadius: "8px",
                color: "hsl(40, 20%, 92%)",
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, "Price"]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={colors.stroke}
              strokeWidth={2}
              fill={`url(#gradient-${metal.id})`}
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default PriceChart;
