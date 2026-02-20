import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import MetalCard from "@/components/MetalCard";
import PriceChart from "@/components/PriceChart";
import ETFTable from "@/components/ETFTable";
import AlertForm from "@/components/AlertForm";
import Footer from "@/components/Footer";
import { METALS_DATA } from "@/lib/metals-data";
import { useMetals } from "@/hooks/use-metals";
import { TrendingUp, Shield, Bell } from "lucide-react";

const Index = () => {
  const { data: liveMetals, isLoading, isError, error } = useMetals();
  
  // Check if live data is valid (has at least one metal with price > 0)
  const hasValidLiveData = liveMetals && liveMetals.length > 0 && liveMetals.some((m) => m.price > 0);
  const metals = hasValidLiveData ? liveMetals : METALS_DATA;
  
  const [selectedMetalId, setSelectedMetalId] = useState<string | null>(metals[0]?.id ?? null);

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
          <h2 className="mb-6 font-display text-2xl font-bold text-foreground">
            Spot Prices
          </h2>
          {isLoading && (
            <p className="mb-2 text-sm text-muted-foreground">Loading live metal prices…</p>
          )}
          {isError && (
            <p className="mb-2 text-sm text-red-400">
              Couldn&apos;t load live metal prices. Showing sample data instead.
              {error instanceof Error && (
                <span className="block text-xs mt-1 opacity-75">{error.message}</span>
              )}
            </p>
          )}
          {!isLoading && !isError && !hasValidLiveData && liveMetals && liveMetals.length > 0 && (
            <p className="mb-2 text-sm text-yellow-400">
              API returned invalid data (all prices are $0.00). Showing sample data instead.
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
