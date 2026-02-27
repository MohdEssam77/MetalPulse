import { createSupabaseAdmin } from "./supabase";
import { fetchLatestMetalPricesUsd } from "./prices";
import { isAlertConditionMet, type PriceAlertRow } from "./alerts";
import { sendPriceAlertEmail } from "./email";

type PriceAlertDbRow = PriceAlertRow;

type EnvLike = Record<string, string | undefined>;

const INTERVAL_MS = Number.parseInt(process.env.ALERT_CHECK_INTERVAL_MS || "900000", 10);

let supabase: any = null;
let supabaseInitError: string | null = null;
try {
  supabase = createSupabaseAdmin();
} catch (e) {
  supabaseInitError = e instanceof Error ? e.message : String(e);
  console.warn(`Alerts worker started without Supabase configured: ${supabaseInitError}`);
}

function buildEmailHtml(params: {
  email: string;
  assetSymbol: string;
  direction: "above" | "below";
  targetPrice: number;
  currentPrice: number;
}): string {
  const { assetSymbol, direction, targetPrice, currentPrice } = params;
  const dirText = direction === "above" ? "above" : "below";
  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">MetalPulse Price Alert</h2>
      <p style="margin: 0 0 10px;">Your alert was triggered:</p>
      <ul>
        <li><b>Asset</b>: ${assetSymbol}</li>
        <li><b>Condition</b>: ${dirText} $${targetPrice}</li>
        <li><b>Current price</b>: $${currentPrice}</li>
      </ul>
      <p style="margin: 16px 0 0; font-size: 12px; color: #666;">If you didn't create this alert, you can ignore this email.</p>
    </div>
  `;
}

async function tick(env: EnvLike = process.env) {
  if (!supabase) {
    throw new Error(supabaseInitError ?? "Missing Supabase env vars");
  }
  const prices = await fetchLatestMetalPricesUsd();

  const { data, error } = await supabase
    .from("price_alerts")
    .select(
      "id, email, asset_type, asset_symbol, direction, target_price, is_active, last_is_condition_met, created_at, updated_at",
    )
    .eq("is_active", true)
    .eq("asset_type", "metal");

  if (error) {
    throw new Error(error.message);
  }

  const alerts: PriceAlertDbRow[] = (data ?? []) as any;

  for (const alert of alerts) {
    const symbol = alert.asset_symbol?.toUpperCase();
    if (!symbol) continue;

    const currentPrice = prices[symbol];
    if (!Number.isFinite(currentPrice)) {
      continue;
    }

    const isMet = isAlertConditionMet({
      direction: alert.direction,
      targetPrice: Number(alert.target_price),
      currentPrice,
    });

    const prev = alert.last_is_condition_met;
    const crossedToTrue = prev === false && isMet === true;

    if (crossedToTrue) {
      const subject = `MetalPulse alert: ${symbol} is ${alert.direction} $${Number(alert.target_price)}`;
      const html = buildEmailHtml({
        email: alert.email,
        assetSymbol: symbol,
        direction: alert.direction,
        targetPrice: Number(alert.target_price),
        currentPrice,
      });

      await sendPriceAlertEmail({
        to: alert.email,
        subject,
        html,
        env: env as any,
      });
    }

    if (prev == null || prev !== isMet) {
      const { error: updateError } = await supabase
        .from("price_alerts")
        .update({ last_is_condition_met: isMet })
        .eq("id", alert.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }
  }
}

async function main() {
  console.log(`Alerts worker started. Interval: ${INTERVAL_MS}ms`);

  while (true) {
    const startedAt = Date.now();
    try {
      await tick();
      console.log(`Alerts worker tick OK (${Date.now() - startedAt}ms)`);
    } catch (error) {
      console.error(`Alerts worker tick failed (${Date.now() - startedAt}ms):`, error);
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
