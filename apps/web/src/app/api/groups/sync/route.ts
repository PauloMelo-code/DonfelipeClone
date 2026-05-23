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
    type RemoteWithRole = {
      id: string;
      subject: string;
      profilePictureUrl?: string;
      defaultRole: "SOURCE" | "TARGET";
      isAnnounce?: boolean;
    };

    // ── 1. Grupos da instancia de CAPTURA ──────────────────────────────────
    const captureGroups = await uazapi.listGroups(true);
    const captureMapped: RemoteWithRole[] = captureGroups.map((g) => ({
      id: g.id,
      subject: g.subject,
      profilePictureUrl: g.profilePictureUrl,
      defaultRole: "SOURCE",
    }));

    // ── 2. Canais (newsletters) da instancia de CAPTURA ────────────────────
    // Canais ficam fora do /group/list -- precisam de chamada separada.
    let captureNewsletters: RemoteWithRole[] = [];
    try {
      const newsletters = await uazapi.listNewsletters();
      captureNewsletters = newsletters.map((n) => ({
        id: n.id,
        subject: n.subject,
        profilePictureUrl: n.profilePictureUrl,
        defaultRole: "SOURCE" as const,
        isAnnounce: true,
      }));
    } catch (err) {
      console.error("[Groups Sync] listNewsletters (capture) failed:", err);
    }

    // ── 3. Grupos + canais da instancia de ENVIO (se configurada) ─────────
    let sendMapped: RemoteWithRole[] = [];
    let sendNewsletters: RemoteWithRole[] = [];
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
        console.error("[Groups Sync] sendInstance groups failed:", err);
      }
      try {
        const sendNews = await uazapiSend.listNewsletters();
        sendNewsletters = sendNews.map((n) => ({
          id: n.id,
          subject: n.subject,
          profilePictureUrl: n.profilePictureUrl,
          defaultRole: "TARGET" as const,
          isAnnounce: true,
        }));
      } catch (err) {
        console.error("[Groups Sync] listNewsletters (send) failed:", err);
      }
    }

    // ── 4. Listas de transmissao (@broadcast) via /chat/list ──────────────
    // Listas nao aparecem em /group/list. Aparecem em chats. Pode falhar
    // silencioso se a build da UAZAPI nao expor.
    type BroadcastInfo = { id: string; name: string };
    const captureBroadcasts: BroadcastInfo[] = (await uazapi.listChats().catch(() => []))
      .filter((c) => c.kind === "broadcast" && c.id);
    const captureBroadcastMapped: RemoteWithRole[] = captureBroadcasts.map((b) => ({
      id: b.id,
      subject: b.name,
      defaultRole: "SOURCE" as const,
    }));

    let sendBroadcastMapped: RemoteWithRole[] = [];
    if (uazapiSend.isConfigured) {
      const sendBroadcasts = (await uazapiSend.listChats().catch(() => []))
        .filter((c) => c.kind === "broadcast" && c.id);
      sendBroadcastMapped = sendBroadcasts.map((b) => ({
        id: b.id,
        subject: b.name,
        defaultRole: "TARGET" as const,
      }));
    }

    // Junta tudo (grupos + canais + broadcasts, captura + envio)
    captureMapped.push(...captureNewsletters, ...captureBroadcastMapped);
    sendMapped.push(...sendNewsletters, ...sendBroadcastMapped);

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
          select: { groupId: true, name: true, role: true, nameLocked: true },
        })
      ).map((g) => [g.groupId, g])
    );

    for (const group of remoteGroups) {
      const groupId = group.id;
      if (!groupId) continue;

      // Resolve name with fallbacks
      let name: string = group.subject || "";
      const isNewsletter = groupId.endsWith("@newsletter") || group.isAnnounce === true;
      if (!name) {
        const client = group.defaultRole === "TARGET" && uazapiSend.isConfigured ? uazapiSend : uazapi;
        // Canais usam endpoint diferente pra info
        const info = isNewsletter
          ? await client.getNewsletterInfo(groupId).catch(() => null)
          : await client.getGroupInfo(groupId).catch(() => null);
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
        // Sync PRESERVA: active, role, region, filters, nameLocked.
        // Atualiza SO name (se nao travado) e photoUrl. Tambem garante a
        // flag isAnnounce pra canais (newsletters).
        const safeName = existing.nameLocked
          ? existing.name
          : name === groupId && existing.name !== groupId
            ? existing.name
            : name;
        await prisma.whatsAppGroup.update({
          where: { groupId },
          data: {
            name: safeName,
            photoUrl,
            ...(isNewsletter ? { isAnnounce: true } : {}),
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
            isAnnounce: isNewsletter,
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
      captureNewsletterCount: captureNewsletters.length,
      sendNewsletterCount: sendNewsletters.length,
      captureBroadcastCount: captureBroadcastMapped.length,
      sendBroadcastCount: sendBroadcastMapped.length,
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
