import { NextRequest, NextResponse } from "next/server";
import { uazapi, uazapiSend } from "@/lib/uazapi";
import { checkMachineSecret } from "@/lib/machine-auth";

/**
 * Health monitor for WhatsApp instances.
 * Pings UAZAPI status -- expoe estado de cada instancia, inclusive o TELEFONE.
 *
 * Trigger via external cron (recommended every 5-10 min) ou consulta manual.
 *
 * HEALTH_MONITOR_SECRET e OBRIGATORIO. Antes era opcional: sem a variavel a
 * rota respondia a qualquer um que passasse pelo middleware, e o middleware so
 * conferia se o cookie existia.
 */
export async function GET(request: NextRequest) {
  const cred = checkMachineSecret(request, {
    headerName: "x-health-secret",
    envVar: "HEALTH_MONITOR_SECRET",
    queryParam: "secret",
  });
  if (!cred.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
