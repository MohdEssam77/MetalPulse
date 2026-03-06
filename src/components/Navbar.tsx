import { useEffect, useState } from "react";
import { BarChart3, Bell, Settings, Sun, Menu } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-6 md:flex">
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
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="hidden items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
                aria-label="Settings"
              >
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

          <Sheet>
            <SheetTrigger asChild>
              <button
                className="inline-flex items-center justify-center rounded-md border border-border bg-secondary/30 p-2 text-foreground transition-colors hover:bg-secondary/50 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              <div className="mt-6 grid gap-4">
                <a href="#prices" className="text-sm text-foreground">
                  Prices
                </a>
                <a href="#etfs" className="text-sm text-foreground">
                  ETFs
                </a>
                <a href="#alerts" className="text-sm text-foreground">
                  <span className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Alerts
                  </span>
                </a>

                <div className="mt-2 rounded-lg border border-border p-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Theme</div>
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

                <div className="rounded-lg border border-border p-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Currency</div>
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
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
