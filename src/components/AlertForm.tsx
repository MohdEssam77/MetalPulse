import { useState } from "react";
import { Bell, Mail, ArrowUp, ArrowDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { METALS_DATA, ETFS_DATA } from "@/lib/metals-data";
import { toast } from "sonner";

const AlertForm = () => {
  const [email, setEmail] = useState("");
  const [selectedAsset, setSelectedAsset] = useState(METALS_DATA[0].id);
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  const allAssets = [
    ...METALS_DATA.map((m) => ({ id: m.id, label: `${m.name} (${m.symbol})`, price: m.price })),
    ...ETFS_DATA.map((e) => ({ id: e.symbol.toLowerCase(), label: `${e.name} (${e.symbol})`, price: e.price })),
  ];

  const currentAsset = allAssets.find((a) => a.id === selectedAsset) ?? allAssets[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !targetPrice) {
      toast.error("Please fill all fields");
      return;
    }
    toast.success(`Alert set! We'll notify you at ${email} when ${currentAsset.label} goes ${direction} $${targetPrice}`);
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
              {METALS_DATA.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.symbol}) — ${m.price.toLocaleString()}
                </option>
              ))}
            </optgroup>
            <optgroup label="ETFs">
              {ETFS_DATA.map((e) => (
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
