import { NextResponse } from "next/server";
import { eq, like } from "drizzle-orm";
import { db, gruposWhatsapp, carimboDeEdicao, vivosE } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { invalidateGroupsCache } from "../route";

/**
 * POST /api/groups/fix-classification
 *
 * Correcao retroativa: desmarca isAnnounce em grupos @g.us.
 *
 * Em syncs anteriores, grupos @g.us com wa_isGroup_announce=true (grupos
 * restritos onde so admin posta) eram marcados como isAnnounce=true e
 * acabavam na aba "Canais". Mas canal real e SO @newsletter.
 */
export async function POST() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const corrigidos = await db
      .update(gruposWhatsapp)
      .set({ isAnnounce: false, ...carimboDeEdicao(auth.user.id) })
      .where(
        vivosE(
          gruposWhatsapp,
          like(gruposWhatsapp.groupId, "%@g.us"),
          eq(gruposWhatsapp.isAnnounce, true)
        )
      )
      .returning({ id: gruposWhatsapp.id });

    invalidateGroupsCache();

    return NextResponse.json({
      message: `${corrigidos.length} grupos @g.us foram reclassificados de Canal para Grupo`,
      fixed: corrigidos.length,
    });
  } catch (error) {
    console.error("[FixClassification] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
