import { useState, useMemo } from "react";
import { Bell, Mail, ArrowUp, ArrowDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { METALS_DATA, ETFS_DATA } from "@/lib/metals-data";
import { useMetals } from "@/hooks/use-metals";
import { useEtfs } from "@/hooks/use-etfs";
import { toast } from "sonner";

const AlertForm = () => {
  const [email, setEmail] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  // Use live data instead of dummy data
  const { data: liveMetals } = useMetals();
  const { data: liveEtfs } = useEtfs();

  // Use live data if available, fallback to dummy data
  const metals = liveMetals && liveMetals.length > 0 ? liveMetals : METALS_DATA;
  const etfs = liveEtfs && liveEtfs.length > 0 ? liveEtfs : ETFS_DATA;

  const allAssets = useMemo(
    () => [
      ...metals.map((m) => ({ id: m.id, type: "metal" as const, symbol: m.symbol, label: `${m.name} (${m.symbol})`, price: m.price })),
      ...etfs.map((e) => ({
        id: e.symbol.toLowerCase(),
        type: "etf" as const,
        symbol: e.symbol,
        label: `${e.name} (${e.symbol})`,
        price: e.price,
      })),
    ],
    [metals, etfs],
  );

  const [selectedAsset, setSelectedAsset] = useState(allAssets[0]?.id ?? METALS_DATA[0].id);

  const currentAsset = allAssets.find((a) => a.id === selectedAsset) ?? allAssets[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !targetPrice) {
      toast.error("Please fill all fields");
      return;
    }

    if (!currentAsset) {
      toast.error("Please select an asset");
      return;
    }

    if (currentAsset.type === "etf") {
      toast.error("ETF alerts are not enabled yet");
      return;
    }

    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        assetType: "metal",
        assetSymbol: currentAsset.symbol,
        direction,
        targetPrice: Number(targetPrice),
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      toast.error(`Failed to set alert: ${t || res.statusText}`);
      return;
    }

    toast.success(
      `Alert set! We'll notify you at ${email} when ${currentAsset.label} goes ${direction} $${targetPrice}`,
    );
    setEmail("");
    setTargetPrice("");
  };

  return (
    <div className="rounded-xl border border-border bg-gradient-card p-6 md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-xl font-semibold text-foreground">
            Price Alerts
          </h3>
          <p className="text-sm text-muted-foreground">
            Get notified when prices hit your target
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Asset
          </label>
          <select
            value={selectedAsset}
            onChange={(e) => setSelectedAsset(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <optgroup label="Precious Metals">
              {metals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.symbol}) — ${m.price.toLocaleString()}
                </option>
              ))}
            </optgroup>
            <optgroup label="ETFs">
              {etfs.map((e) => (
                <option key={e.symbol} value={e.symbol.toLowerCase()}>
                  {e.name} ({e.symbol}) — ${e.price.toFixed(2)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Alert me when price goes
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection("above")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                direction === "above"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <ArrowUp className="h-4 w-4" />
              Above
            </button>
            <button
              type="button"
              onClick={() => setDirection("below")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                direction === "below"
                  ? "border-red-500/50 bg-red-500/10 text-red-400"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <ArrowDown className="h-4 w-4" />
              Below
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Target Price (USD)
          </label>
          <Input
            type="number"
            step="0.01"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder={`Current: $${currentAsset.price.toLocaleString()}`}
            className="border-border bg-secondary text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="border-border bg-secondary pl-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full bg-primary font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-gold"
        >
          <Check className="mr-2 h-4 w-4" />
          Set Price Alert
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Free alerts • No spam • Unsubscribe anytime
        </p>
      </form>
    </div>
  );
};

export default AlertForm;
