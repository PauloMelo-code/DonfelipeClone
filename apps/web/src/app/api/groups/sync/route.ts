import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uazapi, uazapiSend } from "@/lib/uazapi";
import { requireAuth } from "@/lib/auth";
import { invalidateGroupsCache } from "../route";

/**
 * Sincroniza grupos das DUAS instancias UAZAPI:
 * - Captura (uazapi)  -> grupos novos sao criados como SOURCE (origem dos carros)
 * - Envio   (uazapiSend) -> grupos novos sao criados como TARGET (destino de publicacao)
 *
 * Se um grupo aparece em ambas, mantem o role atual no DB (nao reverte).
 * Se a instancia de envio nao estiver configurada, sincroniza so da captura.
 */
export async function GET() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    type RemoteWithRole = { id: string; subject: string; profilePictureUrl?: string; defaultRole: "SOURCE" | "TARGET" };

    const captureGroups = await uazapi.listGroups(true);
    const captureMapped: RemoteWithRole[] = captureGroups.map((g) => ({
      id: g.id,
      subject: g.subject,
      profilePictureUrl: g.profilePictureUrl,
      defaultRole: "SOURCE",
    }));

    let sendMapped: RemoteWithRole[] = [];
    let sendError: string | null = null;
    if (uazapiSend.isConfigured) {
      try {
        const sendGroups = await uazapiSend.listGroups(true);
        sendMapped = sendGroups.map((g) => ({
          id: g.id,
          subject: g.subject,
          profilePictureUrl: g.profilePictureUrl,
          defaultRole: "TARGET",
        }));
      } catch (err) {
        sendError = err instanceof Error ? err.message : String(err);
        console.error("[Groups Sync] sendInstance failed:", err);
      }
    }

    // Merge: prefer entries from send instance for groups that appear in both
    // (those are likely TARGET-relevant). De-dupe by groupId.
    const merged = new Map<string, RemoteWithRole>();
    for (const g of captureMapped) {
      if (g.id) merged.set(g.id, g);
    }
    for (const g of sendMapped) {
      if (!g.id) continue;
      // If group already exists from capture, keep capture's defaultRole=SOURCE
      // unless capture didn't see it. The actual role in DB will be preserved
      // for already-existing groups.
      if (!merged.has(g.id)) merged.set(g.id, g);
    }
    const remoteGroups = Array.from(merged.values());

    if (remoteGroups.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhum grupo retornado pelas instancias UAZAPI",
          captureCount: captureMapped.length,
          sendCount: sendMapped.length,
          sendError,
        },
        { status: 502 }
      );
    }

    let syncedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let nameFallbackCount = 0;

    // Look up existing DB names so we don't overwrite a good name with a JID fallback
    const existingByGroupId = new Map(
      (
        await prisma.whatsAppGroup.findMany({
          where: { groupId: { in: remoteGroups.map((g) => g.id).filter(Boolean) } },
          select: { groupId: true, name: true, role: true },
        })
      ).map((g) => [g.groupId, g])
    );

    for (const group of remoteGroups) {
      const groupId = group.id;
      if (!groupId) continue;

      // Resolve name with fallbacks
      let name: string = group.subject || "";
      if (!name) {
        // Use the right client to fetch info: if this group came from the send
        // instance only, the capture client may not know about it
        const client = group.defaultRole === "TARGET" && uazapiSend.isConfigured ? uazapiSend : uazapi;
        const info = await client.getGroupInfo(groupId).catch(() => null);
        if (info?.subject) {
          name = info.subject;
          nameFallbackCount++;
        }
      }
      const existing = existingByGroupId.get(groupId);
      if (!name && existing && existing.name !== groupId) name = existing.name;
      if (!name) name = groupId;

      const photoUrl = group.profilePictureUrl || null;

      if (existing) {
        // Preserva role escolhida pelo operador. Nome bom no DB nao volta pra JID.
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
            role: group.defaultRole, // SOURCE se veio da captura, TARGET se veio do envio
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
      nameFallbackCount,
      captureGroupCount: captureMapped.length,
      sendGroupCount: sendMapped.length,
      sendInstanceConfigured: uazapiSend.isConfigured,
      sendError,
    });
  } catch (error) {
    console.error("[Groups Sync] Error syncing groups:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao sincronizar grupos" },
      { status: 500 }
    );
  }
}
