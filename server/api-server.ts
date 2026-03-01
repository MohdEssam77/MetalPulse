import http from "node:http";
import { URL } from "node:url";
import { createSupabaseAdmin } from "./supabase";
import { createAlertSchema } from "./alerts";

type Json = Record<string, unknown> | unknown[];

type PriceAlertInsert = {
  email: string;
  asset_type: "metal" | "etf";
  asset_symbol: string;
  direction: "above" | "below";
  target_price: number;
  is_active: boolean;
  last_is_condition_met: boolean | null;
};

type PriceAlertUpdate = Partial<Pick<PriceAlertInsert, "is_active" | "last_is_condition_met">>;

function sendJson(res: http.ServerResponse, statusCode: number, payload: Json) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

const PORT = Number.parseInt(process.env.API_PORT || process.env.PORT || "8788", 10);
let supabase: any = null;
let supabaseInitError: string | null = null;
try {
  supabase = createSupabaseAdmin();
} catch (e) {
  supabaseInitError = e instanceof Error ? e.message : String(e);
  console.warn(`Alerts API running without Supabase configured: ${supabaseInitError}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);

    if (requestUrl.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (requestUrl.pathname.startsWith("/api/alerts") && !supabase) {
      return sendJson(res, 503, {
        error: "Alerts backend is not configured",
        details: supabaseInitError ?? "Missing Supabase env vars",
      });
    }

    if (requestUrl.pathname === "/api/alerts" && req.method === "POST") {
      const body = await readJsonBody(req);
      const parsed = createAlertSchema.safeParse(body);
      if (!parsed.success) {
        return sendJson(res, 400, { error: "Invalid payload", details: parsed.error.flatten() });
      }

      const { email, assetType, assetSymbol, direction, targetPrice } = parsed.data;

      const { data, error } = await supabase
        .from("price_alerts")
        .insert({
          email,
          asset_type: assetType,
          asset_symbol: assetSymbol.toUpperCase(),
          direction,
          target_price: targetPrice,
          is_active: true,
          last_is_condition_met: null,
        } satisfies PriceAlertInsert)
        .select("id, email, asset_type, asset_symbol, direction, target_price, is_active")
        .single();

      if (error) {
        return sendJson(res, 500, { error: error.message });
      }

      return sendJson(res, 201, { alert: data });
    }

    if (requestUrl.pathname === "/api/alerts" && req.method === "GET") {
      const email = requestUrl.searchParams.get("email");
      if (!email) {
        return sendJson(res, 400, { error: "Missing email query param" });
      }

      const { data, error } = await supabase
        .from("price_alerts")
        .select("id, email, asset_type, asset_symbol, direction, target_price, is_active, created_at")
        .eq("email", email)
        .order("created_at", { ascending: false });

      if (error) {
        return sendJson(res, 500, { error: error.message });
      }

      return sendJson(res, 200, { alerts: data ?? [] });
    }

    const del = requestUrl.pathname.match(/^\/api\/alerts\/([0-9a-f-]{36})$/i);
    if (del && req.method === "DELETE") {
      const id = del[1]!;

      const { error } = await supabase
        .from("price_alerts")
        .update({ is_active: false } satisfies PriceAlertUpdate)
        .eq("id", id);

      if (error) {
        return sendJson(res, 500, { error: error.message });
      }

      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
