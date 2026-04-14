import { NextResponse } from "next/server";
import { getSendClient } from "@/lib/uazapi";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const client = getSendClient();
    if (!client.isConfigured) {
      return NextResponse.json({ state: "not_configured", message: "UAZAPI_SEND_BASE_URL/TOKEN não configurados" });
    }
    const status = await client.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("[WhatsApp:Send] Error fetching status:", error);
    return NextResponse.json({ state: "error", error: "Falha ao consultar status" }, { status: 502 });
  }
}
