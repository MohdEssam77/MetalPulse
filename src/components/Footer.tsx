import { BarChart3 } from "lucide-react";

const Footer = () => (
  <footer className="border-t border-border bg-background py-8">
    <div className="container mx-auto px-4">
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <span className="font-display text-sm font-semibold text-foreground">
            Metal<span className="text-gradient-gold">Pulse</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Prices are for informational purposes only. Not financial advice.
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
