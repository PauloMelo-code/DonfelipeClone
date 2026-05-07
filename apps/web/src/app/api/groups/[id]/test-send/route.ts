import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getSendClient } from "@/lib/uazapi";

/**
 * POST /api/groups/[id]/test-send
 * Sends a short text message to the group to verify reachability.
 * Returns the raw UAZAPI error (status + body) on failure so operator can
 * tell apart "not a participant", "invalid jid", "quota exceeded" etc.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    const group = await prisma.whatsAppGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: "Grupo nao encontrado" }, { status: 404 });
    }

    const startedAt = Date.now();
    try {
      const result = await getSendClient().sendText({
        number: group.groupId,
        text: `🧪 Teste de envio Cugini Repasses · ${new Date().toLocaleString("pt-BR")}\n\nEsta mensagem confirma que o sistema consegue publicar nesse destino.`,
      });
      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startedAt,
        messageId: result.key?.id,
        targetJid: group.groupId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          success: false,
          durationMs: Date.now() - startedAt,
          targetJid: group.groupId,
          error: message,
        },
        { status: 200 } // 200 so frontend can read the body easily
      );
    }
  } catch (error) {
    console.error("[GroupTestSend] Unexpected error:", error);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}
