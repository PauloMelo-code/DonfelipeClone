import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, gruposWhatsapp, carimboDeEdicao, vivosE } from "@/lib/db";
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
// Escrita e POST, nao GET.
//
// Este handler insere e atualiza grupos no banco. Como GET, ele era alcancavel
// por navegacao de topo -- e `SameSite=Lax` MANDA o cookie nesse caso, entao um
// link clicado disparava a sincronizacao. A checagem de origem do middleware ja
// fecha isso, mas metodo que escreve tem que dizer que escreve.
export async function POST(request: Request) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  // ?instance=capture|send|both (default both)
  const url = new URL(request.url);
  const instanceParam = url.searchParams.get("instance") ?? "both";
  const syncCapture = instanceParam === "capture" || instanceParam === "both";
  const syncSend = instanceParam === "send" || instanceParam === "both";

  try {
    type RemoteWithRole = {
      id: string;
      subject: string;
      profilePictureUrl?: string;
      defaultRole: "SOURCE" | "TARGET";
      isAnnounce?: boolean;
      isContact?: boolean;
    };

    // ── 1. Grupos da instancia de CAPTURA ──────────────────────────────────
    let captureMapped: RemoteWithRole[] = [];
    let captureNewsletters: RemoteWithRole[] = [];
    if (syncCapture) {
      const captureGroups = await uazapi.listGroups(true);
      captureMapped = captureGroups.map((g) => ({
        id: g.id,
        subject: g.subject,
        profilePictureUrl: g.profilePictureUrl,
        defaultRole: "SOURCE",
      }));

      // Canais (newsletters) da instancia de CAPTURA
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
    }

    // ── 3. Grupos + canais da instancia de ENVIO (se configurada) ─────────
    let sendMapped: RemoteWithRole[] = [];
    let sendNewsletters: RemoteWithRole[] = [];
    let sendError: string | null = null;
    if (syncSend && uazapiSend.isConfigured) {
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

    // ── 4. Chats via POST /chat/find ──────────────────────────────────────
    // Endpoint amplo que retorna tudo (grupos, listas @broadcast, contatos)
    // E expoe flags wa_isGroup_community / wa_isGroup_announce que /group/list
    // nao traz com precisao. Usamos pra:
    // - Capturar listas de transmissao (@broadcast)
    // - Enriquecer grupos com isCommunity / isAnnounce
    const captureChats = syncCapture
      ? await uazapi.listChats().catch(() => [])
      : [];
    const sendChats = syncSend && uazapiSend.isConfigured
      ? await uazapiSend.listChats().catch(() => [])
      : [];

    // Mapa de enriquecimento: JID -> { isCommunity, isAnnounce, name }
    const chatEnrichment = new Map<string, { isCommunity: boolean; isAnnounce: boolean; name: string }>();
    for (const c of [...captureChats, ...sendChats]) {
      if (!c.id) continue;
      const existing = chatEnrichment.get(c.id);
      // Mantem flag se ja foi true em algum chat
      chatEnrichment.set(c.id, {
        isCommunity: existing?.isCommunity || c.isCommunity,
        isAnnounce: existing?.isAnnounce || c.isAnnounce,
        name: c.name || existing?.name || "",
      });
    }

    // Broadcasts: viraram itens novos no sync
    const captureBroadcastMapped: RemoteWithRole[] = captureChats
      .filter((c) => c.kind === "broadcast" && c.id)
      .map((b) => ({
        id: b.id,
        subject: b.name,
        defaultRole: "SOURCE" as const,
      }));
    const sendBroadcastMapped: RemoteWithRole[] = sendChats
      .filter((c) => c.kind === "broadcast" && c.id)
      .map((b) => ({
        id: b.id,
        subject: b.name,
        defaultRole: "TARGET" as const,
      }));

    // Contatos (DM 1-1): JIDs @s.whatsapp.net.
    // Inclui contatos com quem o usuario ja interagiu. Cadastrados como
    // SOURCE inativos -- o admin ativa manualmente o que quiser monitorar.
    const captureContactMapped: RemoteWithRole[] = captureChats
      .filter((c) => c.kind === "user" && c.id)
      .map((c) => ({
        id: c.id,
        subject: c.name || c.id.replace(/@.*/, ""),
        defaultRole: "SOURCE" as const,
        isContact: true,
      }));
    const sendContactMapped: RemoteWithRole[] = sendChats
      .filter((c) => c.kind === "user" && c.id)
      .map((c) => ({
        id: c.id,
        subject: c.name || c.id.replace(/@.*/, ""),
        defaultRole: "SOURCE" as const, // contatos da instancia de envio tambem viram fontes
        isContact: true,
      }));

    // Junta tudo (grupos + canais + broadcasts + contatos, captura + envio)
    captureMapped.push(...captureNewsletters, ...captureBroadcastMapped, ...captureContactMapped);
    sendMapped.push(...sendNewsletters, ...sendBroadcastMapped, ...sendContactMapped);

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
        await db
          .select({
            groupId: gruposWhatsapp.groupId,
            name: gruposWhatsapp.name,
            role: gruposWhatsapp.role,
            nameLocked: gruposWhatsapp.nameLocked,
          })
          .from(gruposWhatsapp)
          .where(
            vivosE(
              gruposWhatsapp,
              inArray(gruposWhatsapp.groupId, remoteGroups.map((g) => g.id).filter(Boolean))
            )
          )
      ).map((g) => [g.groupId, g])
    );

    for (const group of remoteGroups) {
      const groupId = group.id;
      if (!groupId) continue;

      // Enriquecimento via /chat/find (comunidade, announce)
      const chatInfo = chatEnrichment.get(groupId);
      const isCommunity = chatInfo?.isCommunity ?? false;
      const isContact = group.isContact === true || groupId.endsWith("@s.whatsapp.net");

      // Resolve name with fallbacks (prefere /group/list, depois /chat/find)
      let name: string = group.subject || chatInfo?.name || "";
      // CANAL = SO @newsletter (canal oficial do WhatsApp).
      // Grupos @g.us com wa_isGroup_announce=true sao grupos restritos
      // (so admin posta), mas ainda sao GRUPOS, nao canais.
      // Por isso isAnnounce no banco so vira true pra @newsletter.
      const isNewsletter = groupId.endsWith("@newsletter");
      // Contatos nao tem getGroupInfo/getNewsletterInfo -- pula fallback
      if (!name && !isContact) {
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
      if (!name) name = isContact ? groupId.replace(/@.*/, "") : groupId;

      // Contatos novos ganham prefixo "Contato: " se o nome nao tiver
      if (isContact && !existing && !name.startsWith("Contato:") && !name.startsWith("+")) {
        name = `Contato: ${name}`;
      }

      const photoUrl = group.profilePictureUrl || null;

      if (existing) {
        // Sync PRESERVA: active, role, region, filters, nameLocked.
        // Atualiza SO name (se nao travado), photoUrl e a flag isAnnounce/isContact.
        const safeName = existing.nameLocked
          ? existing.name
          : name === groupId && existing.name !== groupId
            ? existing.name
            : name;
        await db
          .update(gruposWhatsapp)
          .set({
            name: safeName,
            photoUrl,
            isAnnounce: isNewsletter,
            isCommunity,
            isContact,
            ...carimboDeEdicao(auth.user.id),
          })
          .where(vivosE(gruposWhatsapp, eq(gruposWhatsapp.groupId, groupId)));
        updatedCount++;
      } else {
        await db.insert(gruposWhatsapp).values({
          groupId,
          name,
          role: group.defaultRole, // SOURCE se veio da captura, TARGET se veio do envio
          active: false, // Tudo do sync comeca inativo (admin ativa o que quer)
          photoUrl,
          isAnnounce: isNewsletter,
          isCommunity,
          isContact,
          modifiedBy: auth.user.id,
        });
        createdCount++;
      }

      syncedCount++;
    }

    invalidateGroupsCache();

    return NextResponse.json({
      message: "Sincronizacao concluida",
      instance: instanceParam,
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
      captureContactCount: captureContactMapped.length,
      sendContactCount: sendContactMapped.length,
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
