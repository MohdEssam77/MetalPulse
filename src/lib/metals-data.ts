export interface MetalData {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  color: string;
  effectiveDate?: string;
}

export interface EtfData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface ChartDataPoint {
  date: string;
  price: number;
}

export interface AlertThreshold {
  metalId: string;
  email: string;
  targetPrice: number;
  direction: 'above' | 'below';
}

export const METALS_DATA: MetalData[] = [
  {
    id: 'gold',
    name: 'Gold',
    symbol: 'XAU',
    price: 2934.50,
    change: 18.30,
    changePercent: 0.63,
    high24h: 2941.20,
    low24h: 2908.10,
    color: 'gold',
  },
  {
    id: 'silver',
    name: 'Silver',
    symbol: 'XAG',
    price: 32.85,
    change: -0.42,
    changePercent: -1.26,
    high24h: 33.40,
    low24h: 32.60,
    color: 'silver',
  },
  {
    id: 'platinum',
    name: 'Platinum',
    symbol: 'XPT',
    price: 1012.40,
    change: 5.60,
    changePercent: 0.56,
    high24h: 1018.00,
    low24h: 1002.80,
    color: 'platinum',
  },
  {
    id: 'palladium',
    name: 'Palladium',
    symbol: 'XPD',
    price: 978.20,
    change: -12.50,
    changePercent: -1.26,
    high24h: 995.00,
    low24h: 970.10,
    color: 'palladium',
  },
];

export const generateChartData = (basePrice: number, days: number = 30): ChartDataPoint[] => {
  const data: ChartDataPoint[] = [];
  let price = basePrice * 0.95;
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    price += (Math.random() - 0.48) * basePrice * 0.01;
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: Math.round(price * 100) / 100,
    });
  }
  return data;
};

export const ETFS_DATA: EtfData[] = [
  { symbol: 'GLD', name: 'SPDR Gold Shares', price: 271.45, change: 1.82, changePercent: 0.67 },
  { symbol: 'SLV', name: 'iShares Silver Trust', price: 29.30, change: -0.35, changePercent: -1.18 },
  { symbol: 'PPLT', name: 'abrdn Platinum ETF', price: 92.15, change: 0.48, changePercent: 0.52 },
  { symbol: 'PALL', name: 'abrdn Palladium ETF', price: 89.60, change: -1.12, changePercent: -1.23 },
  { symbol: 'GDX', name: 'VanEck Gold Miners', price: 42.78, change: 0.95, changePercent: 2.27 },
  { symbol: 'GDXJ', name: 'VanEck Junior Gold Miners', price: 48.92, change: 1.34, changePercent: 2.82 },
];
