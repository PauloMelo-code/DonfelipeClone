import { NextResponse } from "next/server";
import { getSendClient } from "@/lib/uazapi";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const client = getSendClient();
    if (!client.isConfigured) {
      return NextResponse.json({ error: "Instância de envio não configurada" }, { status: 400 });
    }
    const qr = await client.getQR();
    return NextResponse.json(qr ?? { qrcode: null });
  } catch (error) {
    console.error("[WhatsApp:Send] Error fetching QR:", error);
    return NextResponse.json({ error: "Falha ao obter QR Code" }, { status: 502 });
  }
}
