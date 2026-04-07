import { NextResponse } from "next/server";
import { uazapi } from "@/lib/uazapi";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const status = await uazapi.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("[WhatsApp] Error fetching status:", error);
    return NextResponse.json({ state: "error", error: "Falha ao consultar status" }, { status: 502 });
  }
}
