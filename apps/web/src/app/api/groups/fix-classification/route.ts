import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
 *
 * Esse endpoint corrige o legado sem precisar de sync completo.
 */
export async function POST() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    // Desmarca isAnnounce em qualquer @g.us (grupo restrito ou nao,
    // canal e SO @newsletter)
    const result = await prisma.whatsAppGroup.updateMany({
      where: {
        groupId: { endsWith: "@g.us" },
        isAnnounce: true,
      },
      data: { isAnnounce: false },
    });

    invalidateGroupsCache();

    return NextResponse.json({
      message: `${result.count} grupos @g.us foram reclassificados de Canal para Grupo`,
      fixed: result.count,
    });
  } catch (error) {
    console.error("[FixClassification] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
