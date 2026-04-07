import { NextResponse } from "next/server";
import { uazapi } from "@/lib/uazapi";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const result = await uazapi.getQR();
    if (!result) {
      return NextResponse.json({ qrcode: null, message: "Ja conectado ou QR indisponivel" });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[WhatsApp] Error fetching QR:", error);
    return NextResponse.json({ error: "Falha ao obter QR code" }, { status: 502 });
  }
}
