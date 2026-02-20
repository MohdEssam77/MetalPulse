import { useEffect, useState, useRef } from "react";
import Navbar from "@/components/Navbar";
import MetalCard from "@/components/MetalCard";
import PriceChart from "@/components/PriceChart";
import ETFTable from "@/components/ETFTable";
import AlertForm from "@/components/AlertForm";
import Footer from "@/components/Footer";
import { METALS_DATA } from "@/lib/metals-data";
import { useMetals } from "@/hooks/use-metals";
import { TrendingUp, Shield, Bell } from "lucide-react";
import type { MetalData } from "@/lib/metals-data";

const Index = () => {
  const { data: liveMetals, isLoading, isError, error, dataUpdatedAt, isRefetching } = useMetals();
  
  // Store the last valid data we received
  const lastValidDataRef = useRef<MetalData[] | null>(null);
  
  // Check if live data is valid (all metals must have realistic prices)
  const isValidData = (data: MetalData[] | undefined): boolean => {
    return !!(
      data &&
      data.length === 4 &&
      data.every((m) => m.price > 0 && m.price < 100000)
    );
  };
  
  // Update last valid data if current data is valid
  if (liveMetals && isValidData(liveMetals)) {
    lastValidDataRef.current = liveMetals;
  }
  
  // Use live data if valid, otherwise use last valid data, otherwise fall back to dummy data
  const metals =
    (liveMetals && isValidData(liveMetals)
      ? liveMetals
      : lastValidDataRef.current) || METALS_DATA;
  
  const [selectedMetalId, setSelectedMetalId] = useState<string | null>(metals[0]?.id ?? null);
  
  // Format last update time
  const lastUpdateTime = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  useEffect(() => {
    if (!selectedMetalId && metals.length > 0) {
      setSelectedMetalId(metals[0].id);
    }
  }, [metals, selectedMetalId]);

  const selectedMetal = metals.find((m) => m.id === selectedMetalId) ?? metals[0];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="bg-gradient-hero pb-12 pt-16 md:pt-24">
        <div className="container mx-auto px-4 text-center">
          <div className="mx-auto max-w-2xl">
            <h1 className="font-display text-4xl font-bold leading-tight text-foreground md:text-5xl lg:text-6xl">
              Track Precious Metals
              <br />
              <span className="text-gradient-gold">in Real Time</span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Monitor gold, silver, platinum & palladium prices and ETFs.
              Set custom alerts so you never miss a move.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Live Prices
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Free to Use
            </div>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Email Alerts
            </div>
          </div>
        </div>
      </section>

      {/* Prices */}
      <section id="prices" className="py-12">
        <div className="container mx-auto px-4">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold text-foreground">
              Spot Prices
            </h2>
            {lastUpdateTime && (
              <div className="text-xs text-muted-foreground">
                {isRefetching && <span className="text-yellow-400">🔄 Refreshing...</span>}
                {!isRefetching && isValidData(liveMetals) && (
                  <span>Last updated: {lastUpdateTime}</span>
                )}
                {!isRefetching && !isValidData(liveMetals) && lastValidDataRef.current && (
                  <span className="text-yellow-400">
                    Using cached data (last valid: {lastUpdateTime})
                  </span>
                )}
              </div>
            )}
          </div>
          {isLoading && (
            <p className="mb-2 text-sm text-muted-foreground">Loading live metal prices…</p>
          )}
          {isError && (
            <p className="mb-2 text-sm text-red-400">
              Couldn&apos;t load live metal prices. {lastValidDataRef.current ? "Showing cached data." : "Showing sample data."}
              {error instanceof Error && (
                <span className="block text-xs mt-1 opacity-75">{error.message}</span>
              )}
            </p>
          )}
          {!isLoading && !isError && liveMetals && !isValidData(liveMetals) && (
            <p className="mb-2 text-sm text-yellow-400">
              ⚠️ API returned invalid data. {lastValidDataRef.current ? "Showing last valid data." : "Showing sample data."}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metals.map((metal) => (
              <MetalCard
                key={metal.id}
                metal={metal}
                isSelected={selectedMetal?.id === metal.id}
                onClick={() => setSelectedMetalId(metal.id)}
              />
            ))}
          </div>

          <div className="mt-8">
            <PriceChart metal={selectedMetal} />
          </div>
        </div>
      </section>

      {/* ETFs & Alerts */}
      <section id="etfs" className="pb-16 pt-4">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <h2 className="mb-6 font-display text-2xl font-bold text-foreground">
                Metal ETFs
              </h2>
              <ETFTable />
            </div>
            <div id="alerts" className="lg:col-span-2">
              <h2 className="mb-6 font-display text-2xl font-bold text-foreground">
                Set Alerts
              </h2>
              <AlertForm />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
