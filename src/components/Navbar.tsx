import { TrendingUp, TrendingDown, BarChart3, Bell } from "lucide-react";
import { Link } from "react-router-dom";

const Navbar = () => {
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
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
