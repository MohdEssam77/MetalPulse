import dotenv from "dotenv";
import path from "node:path";
import { createSupabaseAdmin } from "./supabase";
import { fetchLatestMetalPricesUsd } from "./prices";
import { isAlertConditionMet, type PriceAlertRow } from "./alerts";
import { sendPriceAlertEmail as sendGmailPriceAlertEmail } from "./emailService";
import { sendPriceAlertEmail as sendSendGridPriceAlertEmail } from "./sendgridEmail";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

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
    .in("asset_type", ["metal", "etf"]);

  if (error) {
    throw new Error(error.message);
  }

  const alerts: PriceAlertDbRow[] = (data ?? []) as any;

  if (alerts.length === 0) {
    console.log("No active alerts found.");
    return;
  }

  for (const alert of alerts) {
    const symbol = alert.asset_symbol?.toUpperCase();
    if (!symbol) continue;

    if (alert.asset_type !== "metal") {
      console.log(`Skipping unsupported alert asset_type=${alert.asset_type} symbol=${symbol} id=${alert.id}`);
      continue;
    }

    const currentPrice = prices[symbol];
    if (!Number.isFinite(currentPrice)) {
      console.log(`Missing price for symbol=${symbol} id=${alert.id}`);
      continue;
    }

    const isMet = isAlertConditionMet({
      direction: alert.direction,
      targetPrice: Number(alert.target_price),
      currentPrice,
    });

    console.log(
      `Alert eval id=${alert.id} email=${alert.email} symbol=${symbol} dir=${alert.direction} target=${Number(alert.target_price)} current=${currentPrice} isMet=${isMet}`,
    );

    // One-shot alert: when condition is met and email is sent, delete the row.
    // If sending fails, keep the row so it can retry next tick.
    if (isMet === true) {
      try {
        if (process.env.SENDGRID_API_KEY) {
          await sendSendGridPriceAlertEmail({
            toEmail: alert.email,
            assetSymbol: symbol,
            thresholdPrice: Number(alert.target_price),
            currentPrice,
          });
        } else {
          await sendGmailPriceAlertEmail(alert.email, symbol, Number(alert.target_price), currentPrice);
        }

        const { error: deleteError } = await supabase.from("price_alerts").delete().eq("id", alert.id);
        if (deleteError) {
          throw new Error(deleteError.message);
        }

        console.log(`Alert email sent and alert deleted id=${alert.id} to=${alert.email}`);
      } catch (e) {
        console.error(`Alert send/delete failed id=${alert.id} to=${alert.email}:`, e);
      }
    }
  }
}

async function main() {
  const provider = process.env.SENDGRID_API_KEY ? "sendgrid" : process.env.GMAIL_USER ? "gmail" : "none";
  console.log(`Alerts worker started. Interval: ${INTERVAL_MS}ms. Email provider: ${provider}`);

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
