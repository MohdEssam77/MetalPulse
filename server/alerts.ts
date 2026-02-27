import { z } from "zod";

export const createAlertSchema = z.object({
  email: z.string().email(),
  assetType: z.enum(["metal", "etf"]),
  assetSymbol: z.string().min(1),
  direction: z.enum(["above", "below"]),
  targetPrice: z.number().finite().positive(),
});

export type CreateAlertInput = z.infer<typeof createAlertSchema>;

export type PriceAlertRow = {
  id: string;
  email: string;
  asset_type: "metal" | "etf";
  asset_symbol: string;
  direction: "above" | "below";
  target_price: number;
  is_active: boolean;
  last_is_condition_met: boolean | null;
  created_at: string;
  updated_at: string;
};

export function isAlertConditionMet(params: {
  direction: "above" | "below";
  targetPrice: number;
  currentPrice: number;
}): boolean {
  const { direction, targetPrice, currentPrice } = params;
  return direction === "above" ? currentPrice >= targetPrice : currentPrice <= targetPrice;
}
