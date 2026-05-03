import { NextRequest, NextResponse } from "next/server";
import { uazapi, uazapiSend } from "@/lib/uazapi";
import { alertWhatsAppDisconnected } from "@/lib/telegram";

/**
 * Health monitor for WhatsApp instances.
 * Pings UAZAPI status and fires Telegram alert if any configured instance is disconnected.
 *
 * Trigger via external cron (recommended every 5-10 min) or internal scheduler.
 * Optional shared-secret protection via HEALTH_MONITOR_SECRET env (header x-health-secret or ?secret=).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.HEALTH_MONITOR_SECRET;
  if (secret) {
    const provided =
      request.headers.get("x-health-secret") ||
      request.nextUrl.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const checks: Array<{
    label: string;
    state: string;
    phone?: string;
    alerted: boolean;
    error?: string;
  }> = [];

  const instances: Array<{ client: typeof uazapi; label: string }> = [];
  if (uazapi.isConfigured) instances.push({ client: uazapi, label: "captura" });
  if (uazapiSend.isConfigured) instances.push({ client: uazapiSend, label: "envio" });

  for (const { client, label } of instances) {
    try {
      const status = await client.getStatus();
      const isDown = status.state !== "open";
      let alerted = false;
      if (isDown) {
        try {
          await alertWhatsAppDisconnected(label);
          alerted = true;
        } catch (err) {
          console.error(`[health-monitor] Telegram alert failed for ${label}:`, err);
        }
      }
      checks.push({ label, state: status.state, phone: status.phone, alerted });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error(`[health-monitor] Status check failed for ${label}:`, err);
      try {
        await alertWhatsAppDisconnected(label);
      } catch {
        /* noop */
      }
      checks.push({ label, state: "error", alerted: true, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    instances: checks,
  });
}

export const POST = GET;
