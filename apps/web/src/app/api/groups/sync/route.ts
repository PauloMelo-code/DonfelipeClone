import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uazapi } from "@/lib/uazapi";
import { requireAuth } from "@/lib/auth";
import { invalidateGroupsCache } from "../route";

export async function GET() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    const remoteGroups = await uazapi.listGroups(true);

    if (!Array.isArray(remoteGroups)) {
      return NextResponse.json(
        { error: "Resposta invalida da API UAZAPI" },
        { status: 502 }
      );
    }

    let syncedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let nameFallbackCount = 0;

    // Look up DB names so we don't overwrite a good name with a JID fallback
    const existingByGroupId = new Map(
      (
        await prisma.whatsAppGroup.findMany({
          where: { groupId: { in: remoteGroups.map((g) => g.id).filter(Boolean) } },
          select: { groupId: true, name: true },
        })
      ).map((g) => [g.groupId, g.name])
    );

    for (const group of remoteGroups) {
      const groupId = group.id;
      if (!groupId) continue;

      // Resolve name with fallbacks:
      //  1. subject from /group/list
      //  2. /group/info if subject is empty
      //  3. existing DB name (don't overwrite with JID)
      //  4. JID itself (last resort)
      let name: string = group.subject || "";
      if (!name) {
        const info = await uazapi.getGroupInfo(groupId).catch(() => null);
        if (info?.subject) {
          name = info.subject;
          nameFallbackCount++;
        }
      }
      if (!name) {
        const existingName = existingByGroupId.get(groupId);
        // Only keep DB name if it isn't itself a JID-fallback
        if (existingName && existingName !== groupId) name = existingName;
      }
      if (!name) name = groupId;

      const photoUrl = group.profilePictureUrl || null;

      const existing = await prisma.whatsAppGroup.findUnique({
        where: { groupId },
      });

      if (existing) {
        // Don't overwrite a good DB name with a JID fallback
        const safeName = name === groupId && existing.name !== groupId ? existing.name : name;
        await prisma.whatsAppGroup.update({
          where: { groupId },
          data: {
            name: safeName,
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

    invalidateGroupsCache();

    return NextResponse.json({
      message: "Sincronizacao concluida",
      total: remoteGroups.length,
      synced: syncedCount,
      created: createdCount,
      updated: updatedCount,
      nameFallbackCount, // grupos que precisaram de /group/info pra ter nome
    });
  } catch (error) {
    console.error("[Groups Sync] Error syncing groups:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao sincronizar grupos" },
      { status: 500 }
    );
  }
}
