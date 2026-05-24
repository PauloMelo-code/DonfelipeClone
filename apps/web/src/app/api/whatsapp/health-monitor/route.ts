import { NextRequest, NextResponse } from "next/server";
import { uazapi, uazapiSend } from "@/lib/uazapi";

/**
 * Health monitor for WhatsApp instances.
 * Pings UAZAPI status -- expoe estado de cada instancia.
 *
 * Trigger via external cron (recommended every 5-10 min) ou consulta manual.
 * Optional shared-secret via HEALTH_MONITOR_SECRET env.
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
    error?: string;
  }> = [];

  const instances: Array<{ client: typeof uazapi; label: string }> = [];
  if (uazapi.isConfigured) instances.push({ client: uazapi, label: "captura" });
  if (uazapiSend.isConfigured) instances.push({ client: uazapiSend, label: "envio" });

  for (const { client, label } of instances) {
    try {
      const status = await client.getStatus();
      checks.push({ label, state: status.state, phone: status.phone });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error(`[health-monitor] Status check failed for ${label}:`, err);
      checks.push({ label, state: "error", error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    instances: checks,
  });
}

export const POST = GET;
