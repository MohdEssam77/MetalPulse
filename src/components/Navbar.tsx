import { useEffect, useState } from "react";
import { BarChart3, Bell, Moon, Settings, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "next-themes";

import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/components/currency-provider";

const Navbar = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { currency, setCurrency } = useCurrency();

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveTheme = theme === "system" ? resolvedTheme : theme;
  const isDark = effectiveTheme === "dark";

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <span className="font-display text-xl font-bold text-foreground">
            Metal<span className="text-gradient-gold">Pulse</span>
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <a href="#prices" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Prices
          </a>
          <a href="#etfs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ETFs
          </a>
          <a href="#alerts" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            <span className="flex items-center gap-1">
              <Bell className="h-4 w-4" />
              Alerts
            </span>
          </a>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground" aria-label="Settings">
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <div className="px-2 py-1.5">
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Theme</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">Dark</span>
                  </div>
                  <Switch
                    checked={mounted ? isDark : false}
                    onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                    aria-label="Toggle theme"
                  />
                </div>
              </div>

              <DropdownMenuSeparator />

              <div className="px-2 py-1.5">
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Currency</div>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "USD" | "EUR")}>
                  <SelectTrigger className="h-9">
                    <SelectValue aria-label="Currency" placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
