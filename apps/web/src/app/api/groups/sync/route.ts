import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uazapi } from "@/lib/uazapi";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const remoteGroups = await uazapi.listGroups();

    if (!Array.isArray(remoteGroups)) {
      return NextResponse.json(
        { error: "Resposta invalida da API UAZAPI" },
        { status: 502 }
      );
    }

    let syncedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;

    for (const group of remoteGroups) {
      const groupId = group.id;
      const name = group.subject || groupId;
      const photoUrl = group.profilePictureUrl || null;

      if (!groupId) continue;

      const existing = await prisma.whatsAppGroup.findUnique({
        where: { groupId },
      });

      if (existing) {
        await prisma.whatsAppGroup.update({
          where: { groupId },
          data: {
            name,
            photoUrl,
          },
        });
        updatedCount++;
      } else {
        await prisma.whatsAppGroup.create({
          data: {
            groupId,
            name,
            role: "SOURCE",
            active: false,
            photoUrl,
          },
        });
        createdCount++;
      }

      syncedCount++;
    }

    return NextResponse.json({
      message: "Sincronizacao concluida",
      total: remoteGroups.length,
      synced: syncedCount,
      created: createdCount,
      updated: updatedCount,
    });
  } catch (error) {
    console.error("[Groups Sync] Error syncing groups:", error);
    return NextResponse.json(
      { error: "Erro ao sincronizar grupos" },
      { status: 500 }
    );
  }
}
