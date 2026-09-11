/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq } from "drizzle-orm";
import {
  db,
  gruposWhatsapp,
  carimboDeEdicao,
  vivosE,
  type GrupoWhatsapp,
} from "@/lib/db";

// ---------------------------------------------------------------------------
// Resolucao do grupo de origem da mensagem.
//
// Grupo novo entra sozinho como SOURCE ativo, para nao perder carro enquanto
// ninguem cadastrou. O lixo e barrado depois, pelas camadas de filtro:
// palavras de veiculo, texto curto demais, extracao que falhou, blocklist,
// padroes aprendidos e nota de qualidade. Spammer se desativa em /grupos.
//
// Em grupo que ja existe, so atualiza as flags de tipo e, quando o nome ainda
// e o proprio numero, resolve para o nome de verdade -- respeitando
// `nameLocked`, que marca renomeacao manual.
// ---------------------------------------------------------------------------

export interface EntradaGrupo {
  groupJid: string;
  chat: Record<string, any>;
  pushName: string | null;
  /** Nome do grupo no payload aninhado (`raw.message.groupName`). */
  groupName: string | null;
  isGroup: boolean;
  isBroadcast: boolean;
  isContact: boolean;
}

export async function resolverGrupo(e: EntradaGrupo): Promise<GrupoWhatsapp | undefined> {
  const { groupJid, chat, pushName, isGroup, isBroadcast, isContact } = e;

  let [group] = await db
    .select()
    .from(gruposWhatsapp)
    .where(vivosE(gruposWhatsapp, eq(gruposWhatsapp.groupId, groupJid)))
    .limit(1);

  // Flags de tipo que a UAZAPI manda no payload.
  const isCommunity = chat?.wa_isGroup_community === true;
  const isAnnounce = chat?.wa_isGroup_announce === true;
  const chatName =
    chat?.wa_name || chat?.name || e.groupName || pushName || groupJid.replace(/@.*/, "");

  if (!group && (isGroup || isBroadcast || isContact)) {
    const prefix = isContact
      ? "Contato: "
      : isAnnounce
        ? "Canal: "
        : isBroadcast
          ? "Lista: "
          : isCommunity
            ? "Comunidade: "
            : "";
    [group] = await db
      .insert(gruposWhatsapp)
      .values({
        groupId: groupJid,
        name: prefix + chatName,
        role: "SOURCE",
        active: true,
        isCommunity,
        isAnnounce,
        isContact: !!isContact,
        ownerPhone: chat?.owner || null,
      })
      .returning();
    const tipo = isContact
      ? "contact"
      : isAnnounce
        ? "channel"
        : isCommunity
          ? "community"
          : isBroadcast
            ? "broadcast"
            : "group";
    console.log(`[Webhook] Auto-registered ${tipo}: ${group.name} (${groupJid})`);
    return group;
  }

  if (!group) return undefined;

  const flagsMudaram =
    group.isCommunity !== isCommunity ||
    group.isAnnounce !== isAnnounce ||
    group.isContact !== !!isContact ||
    (chat?.owner && !group.ownerPhone);

  // Nome ainda placeholder (o proprio numero/JID) e chegou um nome decente.
  let nomeNovo: string | undefined;
  const ehPlaceholder =
    !group.name ||
    group.name === group.groupId ||
    group.name.match(/^Contato:?\s*\+?\d{8,}/) ||
    group.name.match(/^\+?\d{8,}$/);
  const candidato = (pushName || chat?.wa_name || chat?.wa_contactName || "").trim();
  const candidatoValido = candidato.length >= 3 && !/^\+?\d+$/.test(candidato);
  if (!group.nameLocked && ehPlaceholder && candidatoValido) {
    nomeNovo = isContact ? `Contato: ${candidato}` : candidato;
  }

  if (flagsMudaram || nomeNovo) {
    await db
      .update(gruposWhatsapp)
      .set({
        ...(nomeNovo && { name: nomeNovo }),
        isCommunity,
        isAnnounce,
        isContact: !!isContact,
        ownerPhone: group.ownerPhone || chat?.owner || null,
        // Acao do sistema: sem usuario responsavel.
        ...carimboDeEdicao(null),
      })
      .where(vivosE(gruposWhatsapp, eq(gruposWhatsapp.id, group.id)));
    if (nomeNovo) {
      console.log(`[Webhook] Resolved name: ${groupJid} -> "${nomeNovo}"`);
      group = { ...group, name: nomeNovo };
    }
  }

  return group;
}
